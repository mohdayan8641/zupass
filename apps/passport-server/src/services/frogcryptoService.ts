import {
  Biome,
  IFrogData,
  Rarity,
  TEMPERAMENT_MAX,
  TEMPERAMENT_MIN,
  Temperament
} from "@pcd/eddsa-frog-pcd";
import {
  FrogCryptoComputedUserState,
  FrogCryptoManageFrogsRequest,
  FrogCryptoManageFrogsResponseValue,
  FrogCryptoUserStateRequest,
  FrogCryptoUserStateResponseValue
} from "@pcd/passport-interface";
import { SerializedPCD } from "@pcd/pcd-types";
import {
  SemaphoreSignaturePCD,
  SemaphoreSignaturePCDPackage
} from "@pcd/semaphore-signature-pcd";
import _ from "lodash";
import { LRUCache } from "lru-cache";
import { FrogCryptoUserFeedState } from "../database/models";
import {
  fetchUserFeedsState,
  getFrogData,
  initializeUserFeedState,
  insertFrogData,
  sampleFrogData,
  updateUserFeedState
} from "../database/queries/frogcrypto";
import { fetchUserByCommitment } from "../database/queries/users";
import { sqlTransaction } from "../database/sqlQuery";
import { PCDHTTPError } from "../routing/pcdHttpError";
import { ApplicationContext } from "../types";
import { FROGCRYPTO_FEEDS, FrogCryptoFeedConfig } from "../util/frogcrypto";
import { logger } from "../util/logger";
import { RollbarService } from "./rollbarService";

export class FrogcryptoService {
  private readonly context: ApplicationContext;
  private readonly rollbarService: RollbarService | null;
  private readonly verificationPromiseCache: LRUCache<
    string,
    Promise<string | null>
  >;

  public constructor(
    context: ApplicationContext,
    rollbarService: RollbarService | null
  ) {
    this.context = context;
    this.rollbarService = rollbarService;
    this.verificationPromiseCache = new LRUCache<
      string,
      Promise<string | null>
    >({
      max: 1000
    });
  }

  public async getFeeds(): Promise<FrogCryptoFeedConfig[]> {
    return FROGCRYPTO_FEEDS;
  }

  public async getUserState(
    req: FrogCryptoUserStateRequest
  ): Promise<FrogCryptoUserStateResponseValue> {
    const semaphoreId = await this.cachedVerifySignaturePCD(req.pcd);
    if (!semaphoreId) {
      throw new PCDHTTPError(400, "invalid PCD");
    }

    const userFeeds = await fetchUserFeedsState(
      this.context.dbPool,
      semaphoreId
    );

    const allFeeds = _.keyBy(await this.getFeeds(), "id");

    return {
      feeds: userFeeds.map((userFeed) =>
        this.computeUserFeedState(userFeed, allFeeds[userFeed.feed_id])
      )
    };
  }

  public async reserveFrogData(
    pcd: SerializedPCD<SemaphoreSignaturePCD>,
    feed: FrogCryptoFeedConfig
  ): Promise<IFrogData> {
    const semaphoreId = await this.cachedVerifySignaturePCD(pcd);
    if (!semaphoreId) {
      throw new PCDHTTPError(400, "invalid PCD");
    }

    await initializeUserFeedState(this.context.dbPool, semaphoreId, feed.id);

    return sqlTransaction(
      this.context.dbPool,
      "reserve frog",
      async (client) => {
        const lastFetchedAt = await updateUserFeedState(
          client,
          semaphoreId,
          feed.id
        ).catch((e) => {
          if (e.message.includes("could not obtain lock")) {
            throw new PCDHTTPError(
              429,
              "There is another frog request in flight!"
            );
          }
          throw e;
        });
        if (!lastFetchedAt) {
          const e = new Error("User feed state unexpectedly not found!");
          logger(`Error encountered while serving feed:`, e);
          throw e;
        }

        const { nextFetchAt } = this.computeUserFeedState(
          {
            feed_id: feed.id,
            last_fetched_at: lastFetchedAt
          },
          feed
        );
        if (nextFetchAt > Date.now()) {
          throw new PCDHTTPError(403, `Next fetch available at ${nextFetchAt}`);
        }

        const frogData = await sampleFrogData(this.context.dbPool, feed.biomes);
        if (!frogData) {
          throw new PCDHTTPError(404, "Frog Not Found");
        }

        return {
          ..._.pick(frogData, "name", "description"),
          imageUrl: `${process.env.PASSPORT_SERVER_URL}/frogcrypto/images/${frogData.uuid}`,
          frogId: frogData.id,
          biome: this.parseEnum(Biome, frogData.biome),
          rarity: this.parseEnum(Rarity, frogData.rarity),
          temperament: this.parseTemperament(frogData.temperament),
          jump: this.sampleAttribute(frogData.jump_min, frogData.jump_max),
          speed: this.sampleAttribute(frogData.speed_min, frogData.speed_max),
          intelligence: this.sampleAttribute(
            frogData.intelligence_min,
            frogData.intelligence_max
          ),
          beauty: this.sampleAttribute(
            frogData.beauty_min,
            frogData.beauty_max
          ),
          timestampSigned: Date.now(),
          ownerSemaphoreId: semaphoreId
        };
      }
    );
  }

  public async manageFrogData(
    req: FrogCryptoManageFrogsRequest
  ): Promise<FrogCryptoManageFrogsResponseValue> {
    await this.cachedVerifyAdminSignaturePCD(req.pcd);

    try {
      await insertFrogData(this.context.dbPool, req.frogs);
    } catch (e) {
      logger(`Error encountered while inserting frog data:`, e);
      this.rollbarService?.reportError(e);
      throw new PCDHTTPError(500, `Error inserting frog data: ${e}`);
    }

    return {
      frogs: await getFrogData(this.context.dbPool)
    };
  }

  private computeUserFeedState(
    state: FrogCryptoUserFeedState | undefined,
    feed: FrogCryptoFeedConfig
  ): FrogCryptoComputedUserState {
    const lastFetchedAt = state?.last_fetched_at?.getTime() ?? 0;
    const nextFetchAt = lastFetchedAt + feed.cooldown * 1000;

    return {
      feedId: feed.id,
      lastFetchedAt,
      nextFetchAt
    };
  }

  private sampleAttribute(min?: number, max?: number): number {
    return _.random(Math.round(min || 0), Math.round(max || 10));
  }

  private parseEnum(e: Record<number, string>, value: string): number {
    const key = _.findKey(e, (v) => v.toLowerCase() === value.toLowerCase());
    if (key === undefined) {
      throw new Error(`invalid enum value ${value}`);
    }
    return parseInt(key);
  }

  private parseTemperament(value?: string): Temperament {
    if (!value) {
      return _.random(TEMPERAMENT_MIN, TEMPERAMENT_MAX);
    }
    if (value === "N/A") {
      return Temperament.N_A;
    }
    if (value === "???") {
      return Temperament.UNKNOWN;
    }
    return this.parseEnum(Temperament, value);
  }

  /**
   * Returns a promised verification of a PCD, either from the cache or,
   * if there is no cache entry, from the multiprocess service.
   */
  private async cachedVerifySignaturePCD(
    serializedPCD: SerializedPCD<SemaphoreSignaturePCD>
  ): Promise<string | null> {
    const key = JSON.stringify(serializedPCD);
    const cached = this.verificationPromiseCache.get(key);
    if (cached) {
      return cached;
    } else {
      const deserialized = await SemaphoreSignaturePCDPackage.deserialize(
        serializedPCD.pcd
      );
      const promise = SemaphoreSignaturePCDPackage.verify(deserialized).then(
        () => deserialized.claim.identityCommitment
      );
      this.verificationPromiseCache.set(key, promise);
      // If the promise rejects, delete it from the cache
      promise.catch(() => this.verificationPromiseCache.delete(key));
      return promise;
    }
  }

  /**
   * Verify signature PCD against a static list of admin identities.
   */
  private async cachedVerifyAdminSignaturePCD(
    pcd: SerializedPCD<SemaphoreSignaturePCD>
  ): Promise<void> {
    const id = await this.cachedVerifySignaturePCD(pcd);
    if (!id) {
      throw new PCDHTTPError(400, "invalid PCD");
    }
    const user = await fetchUserByCommitment(this.context.dbPool, id);
    if (!user) {
      throw new PCDHTTPError(400, "invalid PCD");
    }
    if (!["forest.fang@outlook.com"].includes(user.email)) {
      throw new PCDHTTPError(403, "not authorized");
    }
  }
}

export function startFrogcryptoService(
  context: ApplicationContext,
  rollbarService: RollbarService | null
): FrogcryptoService {
  const service = new FrogcryptoService(context, rollbarService);

  return service;
}

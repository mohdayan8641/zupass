import { getEdDSAPublicKey } from "@pcd/eddsa-pcd";
import { getHash } from "@pcd/passport-crypto";
import { SerializedPCD } from "@pcd/pcd-types";
import { ZKEdDSAEventTicketPCDPackage } from "@pcd/zk-eddsa-event-ticket-pcd";
import AsyncLock from "async-lock";
import { fetchDevconnectPretixTicketByTicketId } from "../database/queries/devconnect_pretix_tickets/fetchDevconnectPretixTicket";
import {
  claimNewPoapUrl,
  getExistingClaimUrlByTicketId
} from "../database/queries/poap";
import { ApplicationContext } from "../types";
import { logger } from "../util/logger";
import { getServerErrorUrl } from "../util/util";
import { RollbarService } from "./rollbarService";
import { traced } from "./telemetryService";

// Set up an async-lock to prevent race conditions when two separate invocations
// of `getDevconnectPoapClaimUrl()` with the same `ticketId` end up claiming separete
// POAP links.
const lock = new AsyncLock();

const DEVCONNECT_COWORK_SPACE_EVENT_ID = "a1c822c4-60bd-11ee-8732-763dbf30819c";

// All valid Cowork products that can claim a POAP. This excludes add-on products, like the Turkish Towel.
const DEVCONNECT_COWORK_SPACE_VALID_PRODUCT_IDS = [
  "67687bda-986f-11ee-abf3-126a2f5f3c5c",
  "67689552-986f-11ee-abf3-126a2f5f3c5c",
  "6768a2e0-986f-11ee-abf3-126a2f5f3c5c",
  "6768af1a-986f-11ee-abf3-126a2f5f3c5c",
  "6768c81a-986f-11ee-abf3-126a2f5f3c5c",
  "6768d44a-986f-11ee-abf3-126a2f5f3c5c",
  "6768e21e-986f-11ee-abf3-126a2f5f3c5c",
  "6768ecf0-986f-11ee-abf3-126a2f5f3c5c",
  "6768f7cc-986f-11ee-abf3-126a2f5f3c5c",
  "67690410-986f-11ee-abf3-126a2f5f3c5c",
  "67690e92-986f-11ee-abf3-126a2f5f3c5c",
  "67691888-986f-11ee-abf3-126a2f5f3c5c",
  "67692468-986f-11ee-abf3-126a2f5f3c5c",
  "676932d2-986f-11ee-abf3-126a2f5f3c5c",
  "67694cfe-986f-11ee-abf3-126a2f5f3c5c",
  "676961d0-986f-11ee-abf3-126a2f5f3c5c"
];

/**
 * Responsible for issuing POAP (poap.xyz) mint links to users
 * who have attended a certain event, e.g. Devconnect.
 */
export class PoapService {
  private readonly context: ApplicationContext;
  private readonly rollbarService: RollbarService | null;

  public constructor(
    context: ApplicationContext,
    rollbarService: RollbarService | null
  ) {
    this.context = context;
    this.rollbarService = rollbarService;
  }

  /**
   * Validates that a serialized ZKEdDSAEventTicketPCD is a valid
   * Devconnect Cowork ticket that has been checked in, and returns
   * the ID of that ticket.
   *
   * This function throws an error in the case that the PCD is not
   * valid; for example, here are a few invalid cases
   *  1. Wrong PCD type
   *  2. Wrong EdDSA public key
   *  3. PCD proof is invalid
   *  4. Ticket does not exist
   *  5. Ticket has not been checked in
   *  6. Event of ticket is not Cowork space
   *  7. Invalid product for claiming a poap, e.g. EF Towel
   */
  private async validateDevconnectTicket(
    serializedPCD: string
  ): Promise<string> {
    return traced("poap", "validateDevconnectPCD", async (span) => {
      logger(
        "[POAP] checking that PCD type is ZKEdDSAEventTicketPCD",
        serializedPCD
      );
      const parsed = JSON.parse(serializedPCD) as SerializedPCD;
      if (parsed.type !== ZKEdDSAEventTicketPCDPackage.name) {
        throw new Error("proof must be ZKEdDSAEventTicketPCD type");
      }

      const pcd = await ZKEdDSAEventTicketPCDPackage.deserialize(parsed.pcd);

      logger(
        `[POAP] checking that signer of ticket ${pcd.claim.partialTicket.ticketId} is passport-server`
      );
      if (!process.env.SERVER_EDDSA_PRIVATE_KEY)
        throw new Error(`missing server eddsa private key .env value`);

      const TICKETING_PUBKEY = await getEdDSAPublicKey(
        process.env.SERVER_EDDSA_PRIVATE_KEY
      );

      const signerMatch =
        pcd.claim.signer[0] === TICKETING_PUBKEY[0] &&
        pcd.claim.signer[1] === TICKETING_PUBKEY[1];

      if (!signerMatch) {
        throw new Error("signer of PCD is invalid");
      }

      logger("[POAP] verifying PCD proof and claim", pcd);
      if (!(await ZKEdDSAEventTicketPCDPackage.verify(pcd))) {
        throw new Error("pcd invalid");
      }

      const {
        validEventIds,
        partialTicket: { ticketId }
      } = pcd.claim;

      logger(
        `[POAP] checking that validEventds ${validEventIds} matches cowork space`
      );
      if (
        !(
          validEventIds &&
          validEventIds.length === 1 &&
          validEventIds[0] === DEVCONNECT_COWORK_SPACE_EVENT_ID
        )
      ) {
        throw new Error(
          "valid event IDs of PCD does not match Devconnect Cowork space"
        );
      }

      logger(`[POAP] fetching devconnect ticket ${ticketId} from database`);
      if (ticketId == null) {
        throw new Error("ticket ID must be revealed");
      }
      const devconnectPretixTicket =
        await fetchDevconnectPretixTicketByTicketId(
          this.context.dbPool,
          ticketId
        );
      if (devconnectPretixTicket == null) {
        throw new Error("ticket ID does not exist");
      }
      const { devconnect_pretix_items_info_id, is_consumed, email } =
        devconnectPretixTicket;

      span?.setAttribute("ticketId", ticketId);
      span?.setAttribute("email", email);
      span?.setAttribute("isConsumed", is_consumed);

      logger(
        `[POAP] checking that devconnect ticket ${ticketId} has been consumed`
      );

      if (!is_consumed) {
        throw new Error("ticket was not checked in at Devconnect");
      }

      span?.setAttribute("productId", devconnect_pretix_items_info_id);

      logger(
        `[POAP] checking that devconnect ticket ${ticketId} has a valid product id`
      );
      if (
        !DEVCONNECT_COWORK_SPACE_VALID_PRODUCT_IDS.includes(
          devconnect_pretix_items_info_id
        )
      ) {
        throw new Error("product ID is invalid");
      }

      return ticketId;
    });
  }

  /**
   * Given a ZKEdDSAEventTicketPCD sent to the server for claiming a Devconnect POAP,
   * returns the valid redirect URL to the response handler.
   *  1. If this ticket is already associated with a POAP mint link, return that link.
   *  2. If this ticket is not associated with a POAP mint link and more unclaimed POAP
   *     links exist, then associate that unclaimed link with this ticket and return it.
   *  3. If this ticket is not associated with a POAP mint link and no more unclaimed
   *     POAP links exist, return a custom server error URL.
   */
  public async getDevconnectPoapRedirectUrl(
    serializedPCD: string
  ): Promise<string> {
    try {
      const ticketId = await this.validateDevconnectTicket(serializedPCD);
      const poapLink = await this.getDevconnectPoapClaimUrlByTicketId(ticketId);
      if (poapLink == null) {
        throw new Error("Not enough Devconnect POAP links");
      }
      return poapLink;
    } catch (e) {
      logger("[POAP] getDevconnectPoapClaimUrl error", e);
      this.rollbarService?.reportError(e);
      // Return the generic /server-error page instead for the route to redirect to,
      // with a title and description informing the user to contact support.
      return getServerErrorUrl(
        "Contact support",
        "An error occurred while fetching your POAP mint link for Devconnect 2023."
      );
    }
  }

  /**
   * Helper function to handle the logic of retrieving the correct POAP mint link
   * given the ticket ID. Returns NULL if the ticket is not associate with a link
   * and no more unclaimed links exist.
   */
  public async getDevconnectPoapClaimUrlByTicketId(
    ticketId: string
  ): Promise<string | null> {
    return traced(
      "poap",
      "getDevconnectPoapClaimUrlByTicketId",
      async (span) => {
        span?.setAttribute("ticketId", ticketId);
        const hashedTicketId = await getHash(ticketId);
        span?.setAttribute("hashedTicketId", hashedTicketId);
        // This critical section executes within a lock to prevent the case where two
        // separate invocations both end up on the `claimNewPoapUrl()` function.
        const poapLink = await lock.acquire(ticketId, async () => {
          const existingPoapLink = await getExistingClaimUrlByTicketId(
            this.context.dbPool,
            hashedTicketId
          );
          if (existingPoapLink != null) {
            span?.setAttribute("alreadyClaimed", true);
            span?.setAttribute("poapLink", existingPoapLink);
            return existingPoapLink;
          }

          const newPoapLink = await claimNewPoapUrl(
            this.context.dbPool,
            "devconnect",
            hashedTicketId
          );

          span?.setAttribute("alreadyClaimed", false);
          if (newPoapLink) {
            span?.setAttribute("poapLink", newPoapLink);
          }

          return newPoapLink;
        });

        return poapLink;
      }
    );
  }
}

export function startPoapService(
  context: ApplicationContext,
  rollbarService: RollbarService | null
): PoapService {
  logger(`[INIT] initializing POAP`);

  return new PoapService(context, rollbarService);
}

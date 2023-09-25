import { EdDSATicketPCDPackage } from "@pcd/eddsa-ticket-pcd";
import {
  ISSUANCE_STRING,
  PCDPassFeedIds,
  pollFeed
} from "@pcd/passport-interface";
import { PCDActionType, ReplaceInFolderAction } from "@pcd/pcd-collection";
import { Identity } from "@semaphore-protocol/identity";
import { expect } from "chai";
import "mocha";
import { step } from "mocha-steps";
import {
  getZuzaluPretixConfig,
  ZuzaluPretixOrder
} from "../src/apis/zuzaluPretixAPI";
import { stopApplication } from "../src/application";
import { ZUZALU_ORGANIZER_EVENT_ID } from "../src/services/issuanceService";
import { PretixSyncStatus } from "../src/services/types";
import { PCDpass } from "../src/types";
import { getMockPretixAPI } from "./pretix/mockPretixApi";
import { waitForPretixSyncStatus } from "./pretix/waitForPretixSyncStatus";
import { ZuzaluPretixDataMocker } from "./pretix/zuzaluPretixDataMocker";
import { testLoginPCDpass } from "./user/testLoginPCDPass";
import { overrideEnvironment, pcdpassTestingEnv } from "./util/env";
import { startTestingApp } from "./util/startTestingApplication";

describe("zuzalu pcdpass functionality", function () {
  this.timeout(30_000);

  let application: PCDpass;

  let pretixMocker: ZuzaluPretixDataMocker;
  let identity: Identity;
  let order: ZuzaluPretixOrder;

  this.beforeAll(async () => {
    await overrideEnvironment(pcdpassTestingEnv);
    const pretixConfig = getZuzaluPretixConfig();

    if (!pretixConfig) {
      throw new Error(
        "expected to be able to get a pretix config for zuzalu tests"
      );
    }

    pretixMocker = new ZuzaluPretixDataMocker(pretixConfig);
    const pretixAPI = getMockPretixAPI(pretixMocker.getMockData());
    application = await startTestingApp({ zuzaluPretixAPI: pretixAPI });

    if (!application.services.zuzaluPretixSyncService) {
      throw new Error("expected there to be a pretix sync service");
    }
  });

  this.afterAll(async () => {
    await stopApplication(application);
  });

  step("pretix should sync to completion", async function () {
    const pretixSyncStatus = await waitForPretixSyncStatus(application, true);
    expect(pretixSyncStatus).to.eq(PretixSyncStatus.Synced);
    // stop interval that polls the api so we have more granular control over
    // testing the sync functionality
    application.services.zuzaluPretixSyncService?.stop();
  });

  step("should be able to log in", async function () {
    order = pretixMocker.getResidentsAndOrganizers()[0];
    const result = await testLoginPCDpass(application, order.email, {
      expectEmailIncorrect: false,
      expectUserAlreadyLoggedIn: false,
      force: false
    });

    if (!result) {
      throw new Error("failed to log in");
    }

    identity = result.identity;
  });

  step(
    "user should be able to be issued Zuzalu ticket PCDs from the server",
    async function () {
      const response = await pollFeed(
        application.expressContext.localEndpoint,
        identity,
        ISSUANCE_STRING,
        PCDPassFeedIds.Zuzalu_1
      );

      if (!response.success) {
        throw new Error("expected to be able to poll the feed");
      }

      expect(response.value.actions.length).to.eq(2);
      const action = response.value.actions[1] as ReplaceInFolderAction;

      expect(action.type).to.eq(PCDActionType.ReplaceInFolder);
      expect(action.folder).to.eq("Zuzalu");

      expect(Array.isArray(action.pcds)).to.eq(true);
      expect(action.pcds.length).to.eq(1);

      const zuzaluTicketPCD = action.pcds[0];

      expect(zuzaluTicketPCD.type).to.eq(EdDSATicketPCDPackage.name);

      const deserializedZuzaluTicketPCD =
        await EdDSATicketPCDPackage.deserialize(zuzaluTicketPCD.pcd);

      expect(deserializedZuzaluTicketPCD.claim.ticket.eventId).to.eq(
        ZUZALU_ORGANIZER_EVENT_ID
      );

      const verified = await EdDSATicketPCDPackage.verify(
        deserializedZuzaluTicketPCD
      );
      expect(verified).to.eq(true);
    }
  );
});
import { expect } from "chai";
import "mocha";
import { step } from "mocha-steps";
import { Pool } from "pg";
import { getDB } from "../src/database/postgresPool";
import { fetchPretixConfiguration } from "../src/database/queries/pretix_config/fetchPretixConfiguration";
import {
  getAllOrganizers,
  insertPretixEventConfig,
  insertPretixOrganizerConfig
} from "../src/database/queries/pretix_config/insertConfiguration";
import { overrideEnvironment, pcdpassTestingEnv } from "./util/env";
import { v4 as uuid } from "uuid";
import {
  fetchPretixItemsInfoByEvent,
  insertPretixItemsInfo
} from "../src/database/queries/pretixItemInfo";
import { insertPretixEventsInfo } from "../src/database/queries/pretixEventInfo";

describe.only("database reads and writes", function () {
  this.timeout(15_000);

  let db: Pool;

  const testOrganizerUrl = "https://www.example.com/test";
  const testToken = uuid();
  const testEventId = "test-id";
  const testEventName = "Test Event";
  const testItemInfos = [
    { id: "1", name: "Item One" },
    { id: "2", name: "Item Two" },
    { id: "3", name: "Item Three" }
  ];
  const expectedOrgId = 1;
  const expectedEventId = 1;
  const expectedEventInfoId = 1;

  this.beforeAll(async () => {
    await overrideEnvironment(pcdpassTestingEnv);
    db = await getDB();
  });

  this.afterAll(async () => {
    await db.end();
  });

  step("database should initialize", async function () {
    expect(db).to.not.eq(null);
  });

  step("should be able to insert a new organizer", async function () {
    const id = await insertPretixOrganizerConfig(
      db,
      testOrganizerUrl,
      testToken
    );
    expect(id).to.eq(expectedOrgId);
    const allOrganizers = await getAllOrganizers(db);
    expect(allOrganizers.length).to.eq(1);
  });

  step(
    "should be able to insert a new event for that organizer",
    async function () {
      const eventId = await insertPretixEventConfig(
        db,
        expectedOrgId,
        testItemInfos.map((item) => item.id),
        testEventId
      );
      expect(eventId).to.eq(expectedEventId);
    }
  );

  step("should be able to get pretix configuration", async function () {
    const configs = await fetchPretixConfiguration(db);
    const firstConfig = configs[0];

    expect(configs.length).to.eq(1);
    expect(firstConfig.token).to.eq(testToken);
    expect(firstConfig.id).to.eq(1);
    expect(firstConfig.organizer_url).to.eq(testOrganizerUrl);
    expect(firstConfig.events).to.deep.eq([
      {
        id: 1,
        pretix_organizers_config_id: 1,
        active_item_ids: testItemInfos.map((item) => item.id),
        event_id: testEventId
      }
    ]);
  });

  step("should be able to insert pretix event information", async function () {
    const eventsInfoId = await insertPretixEventsInfo(
      db,
      testEventName,
      expectedEventId
    );
    expect(eventsInfoId).to.eq(expectedEventInfoId);
  });

  step("should be able to insert pretix item information", async function () {
    let expectedId = 1;
    for (const itemInfo of testItemInfos) {
      const itemInfoId = await insertPretixItemsInfo(
        db,
        itemInfo.id,
        expectedEventInfoId,
        itemInfo.name
      );
      expect(itemInfoId).to.eq(expectedId++);
    }

    const dbItemInfos = await fetchPretixItemsInfoByEvent(db, expectedEventId);
    expect(dbItemInfos.length).to.eq(testItemInfos.length);

    for (let i = 0; i < dbItemInfos.length; i++) {
      expect(dbItemInfos[i].item_id).to.eq(testItemInfos[i].id);
      expect(dbItemInfos[i].item_name).to.eq(testItemInfos[i].name);
    }
  });

  step(
    "should be able to insert pretix event information",
    async function () {}
  );
});

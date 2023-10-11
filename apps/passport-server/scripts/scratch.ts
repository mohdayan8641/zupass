/* eslint-disable */
import { POST } from "@pcd/passport-interface";
import { sleep } from "@pcd/util";
import * as dotenv from "dotenv";
import * as path from "path";
import yargs from "yargs";

import { DevconnectPretixAPI } from "../src/apis/devconnect/devconnectPretixAPI";
import { getDB } from "../src/database/postgresPool";
import { fetchPretixEventInfo } from "../src/database/queries/pretixEventInfo";
import {
  insertPretixEventConfig,
  insertPretixOrganizerConfig
} from "../src/database/queries/pretix_config/insertConfiguration";
import { logger } from "../src/util/logger";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

yargs
  .scriptName("yarn scratch")
  .usage("$0 <cmd> [args]")
  .command(
    "load-test",
    "hit the server with a bunch of concurrent and expensive requests",
    (yargs) => {},
    async function (argv) {
      async function feedRequest(): Promise<void> {
        try {
          // intercept a request to a feed from your browser
          // to local zupass, and replace the value of this variable
          // with those contents to be able to make a successful request
          //
          // DO NOT COPY FROM PRODUCTION AND THEN PUSH UP TO GITHUB
          const body = {
            feedId: "1",
            pcd: {
              type: "semaphore-signature-pcd",
              pcd: '{"type":"semaphore-signature-pcd","id":"c1c44692-6bfe-4259-9159-b2d1d75091d2","claim":{"identityCommitment":"11287489681354334342456202720816965877735857088180790146035994562209836969821","signedMessage":"{\\"timestamp\\":1697060868463}","nullifierHash":"15777544426622154304519824532950506696783399341529290910760677592641872399084"},"proof":["5441678742760762092183949603502475640044363645992406173315997169545701297666","4960508066612368866297345099530554442348765159440360026673739444531852101045","18578416250364410507285933830242661703116225810920092108750578502879465926576","5397913162842717210652724963094907530978362957602703882938052960022543534142","7118553580771896279128910373845594413558036116869118820282004373025722786921","4292182664653324053659706945121351916064640781666654046799855591582785555600","19584542716378336333617627606535848240217430488199950170675145856637825072632","3157086137338087539162492257947749223213376949036115503823344910704589844855"]}'
            }
          };

          const url = "http://localhost:3002/feeds";
          console.log(`making request to ${url}`);
          const res = await fetch(url, {
            ...POST,
            body: JSON.stringify(body)
          });
          console.log(`got a result from ${url}`);
          const resText = await res.text();
          console.log(resText.substring(0, Math.min(300, resText.length - 2)));
        } catch (e) {
          console.log(e);
        }
      }

      const sleepBetweenRuns = 100;
      const sleepBetweenRequests = 0;
      const perIterationCount = 1;
      let i = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        console.log("%%%%%%%%%%%%%%%%%%%%%%%");
        console.log("STARTING ITERATION " + ++i);
        console.log("%%%%%%%%%%%%%%%%%%%%%%%");
        const promises = [];
        for (let i = 0; i < perIterationCount; i++) {
          promises.push(feedRequest());
          await sleep(sleepBetweenRequests);
        }
        await Promise.allSettled(promises);
        await sleep(sleepBetweenRuns);
      }
    }
  )
  .command(
    "fetch",
    "Fetch all events and items from pretix",
    (yargs) => {},
    async function (argv) {
      const orgUrl: string = process.env.SCRATCH_PRETIX_ORG_URL!;
      const token: string = process.env.SCRATCH_PRETIX_TOKEN!;

      if (!orgUrl || !token) {
        throw new Error(`missing orgUrl or pretix token`);
      }

      const api = new DevconnectPretixAPI();
      const events = await api.fetchAllEvents(orgUrl, token);

      logger();
      logger(`EVENTS: ${orgUrl}`);
      for (const e of events) {
        const items = await api.fetchItems(orgUrl, token, e.slug);
        logger(`EVENT name: '${e.name.en}'; slug: '${e.slug}'`);
        items.forEach((i) => {
          logger(`  ITEM id: '${i.id}'; name: '${i.name.en}'`);
        });
        const itemsStr = `  ITEMS: {${items.map((i) => i.id).join(", ")}}`;
        logger(itemsStr);
      }

      logger();
    }
  )
  .command(
    "new-dev-event [token] [orgUrl] [eventId] [activeItemIds]",
    "Create a new event for development",
    (yargs) =>
      yargs
        .positional("token", {
          type: "string",
          demandOption: true,
          describe:
            "Pretix auth token (see https://docs.pretix.eu/en/latest/api/tokenauth.html)"
        })
        .positional("orgUrl", {
          type: "string",
          default: "https://pretix.eu/api/v1/organizers/pcd-0xparc",
          describe:
            "the org url for the event (ex: https://pretix.eu/api/v1/organizers/pcd-0xparc)"
        })
        .positional("eventId", {
          type: "string",
          default: "progcrypto",
          describe: "the id of the event (ex: progcrypto)"
        })
        .positional("activeItemIds", {
          type: "string",
          default: "369803,369805,369804,374045,374043",
          describe:
            "Comma separated list of active item ids ex: 369803,369805,374045"
        }),
    async function (argv) {
      logger(
        `Creating event with org: ${argv.orgUrl} id: ${argv.eventId} and active items: ${argv.activeItemIds}`
      );

      const db = await getDB();

      const organizerConfigId = await insertPretixOrganizerConfig(
        db,
        argv.orgUrl,
        argv.token
      );
      logger(`organizerConfigId: ${organizerConfigId}`);

      const eventConfigId = await insertPretixEventConfig(
        db,
        organizerConfigId,
        argv.activeItemIds.split(","),
        [],
        argv.eventId
      );
      logger(`eventConfigId: ${eventConfigId}`);

      const eventInfo = await fetchPretixEventInfo(db, eventConfigId);
      if (!eventInfo)
        logger(
          `The event for eventConfigId ${eventConfigId} has not been found yet. Make sure the passport-server is running and has synced the latest Pretix info`
        );
      else {
        logger(
          `You have successfully added ${eventInfo.event_name} to your local DB.\nTo link this event with Telegram, create a new private group, add your bot to the channel, then type:`
        );
        logger(`\/link ${eventInfo.event_name}`);
      }
      await db.end();
    }
  )
  .help().argv;

if (process.argv.slice(2).length === 0) {
  yargs.showHelp();
}

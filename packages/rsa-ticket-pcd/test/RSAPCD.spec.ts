import { ArgumentTypeName } from "@pcd/pcd-types";
import { RSAPCD, RSAPCDPackage } from "@pcd/rsa-pcd";
import { expect } from "chai";
import "mocha";
import NodeRSA from "node-rsa";
import { RSATicketPCDPackage } from "../src";

describe("RSA Ticket PCD should work", function () {
  this.timeout(1000 * 30);

  const key = new NodeRSA({ b: 2048 });
  const exportedKey = key.exportKey("private");
  const message = "message to sign";
  let rsaPCD: RSAPCD;

  this.beforeAll(async () => {
    rsaPCD = await RSAPCDPackage.prove({
      privateKey: {
        argumentType: ArgumentTypeName.String,
        value: exportedKey,
      },
      signedMessage: {
        argumentType: ArgumentTypeName.String,
        value: message,
      },
      id: {
        argumentType: ArgumentTypeName.String,
        value: undefined,
      },
    });
  });

  it("should be possible to set a custom id", async function () {
    const ticketPCD = await RSATicketPCDPackage.prove({
      id: {
        argumentType: ArgumentTypeName.String,
        value: undefined,
      },
      rsaPCD: {
        argumentType: ArgumentTypeName.PCD,
        value: await RSAPCDPackage.serialize(rsaPCD),
      },
    });

    const valid = await RSATicketPCDPackage.verify(ticketPCD);
    expect(valid).to.eq(true);
  });
});

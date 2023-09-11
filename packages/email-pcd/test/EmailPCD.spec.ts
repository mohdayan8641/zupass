import { ArgumentTypeName } from "@pcd/pcd-types";
import { expect } from "chai";
import "mocha";
import { EmailPCD, EmailPCDPackage, IEmailData } from "../src";

describe("EdDSA ticket should work", function () {
  this.timeout(1000 * 30);

  let ticket: EmailPCD;

  this.beforeAll(async () => {
    await EmailPCDPackage.init?.({});

    // Key borrowed from https://github.com/iden3/circomlibjs/blob/4f094c5be05c1f0210924a3ab204d8fd8da69f49/test/eddsa.js#L103
    const prvKey =
      "0001020304050607080900010203040506070809000102030405060708090001";

    const emailData: IEmailData  = {
      email: "user@test.com",
    };

    ticket = await EmailPCDPackage.prove({
      email: {
        value: emailData,
        argumentType: ArgumentTypeName.Object
      },
      privateKey: {
        value: prvKey,
        argumentType: ArgumentTypeName.String
      },
      id: {
        value: undefined,
        argumentType: ArgumentTypeName.String
      }
    });
  });

  it("should be able to create and verify a signed ticket", async function () {
    expect(await EmailPCDPackage.verify(ticket)).to.be.true;
  });

  it("should be possible to serialize and deserialize the pcd", async function () {
    const serialized = await EmailPCDPackage.serialize(ticket);
    const deserialized = await EmailPCDPackage.deserialize(
      serialized.pcd
    );
    expect(deserialized).to.deep.eq(ticket);
  });
});

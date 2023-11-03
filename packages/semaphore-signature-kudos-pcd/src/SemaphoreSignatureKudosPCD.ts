import {
  ArgumentTypeName,
  DisplayOptions,
  ObjectArgument,
  PCD,
  PCDArgument,
  PCDPackage,
  ProveDisplayOptions,
  SerializedPCD
} from "@pcd/pcd-types";
import { SemaphoreIdentityPCD } from "@pcd/semaphore-identity-pcd";
import {
  SemaphoreSignaturePCD,
  SemaphoreSignaturePCDPackage
} from "@pcd/semaphore-signature-pcd";
import { ZKEdDSAEventTicketPCD } from "@pcd/zk-eddsa-event-ticket-pcd";
import stableStringify from "fast-json-stable-stringify";
import JSONBig from "json-bigint";
import _ from "lodash";
import { v4 as uuid } from "uuid";
import { SemaphoreSignatureKudosPCDCardBody } from "./CardBody";

/**
 * The globally unique type name of the {@link SemaphoreSignatureKudosPCD}.
 */
export const SemaphoreSignatureKudosPCDTypeName =
  "semaphore-signature-kudos-pcd";

export interface KudosUserInfo {
  semaphoreID: string;
}

export enum KudosTargetType {
  User = "user",
  Post = "post"
}

export type KudosUserTarget = {
  type: KudosTargetType.User;
  user: KudosUserInfo;
  post?: never;
};

export type KudosPostTarget = {
  type: KudosTargetType.Post;
  user?: never;
  post: ZKEdDSAEventTicketPCD;
};

export type KudosTarget = KudosUserTarget | KudosPostTarget;

export interface IKudosData {
  target: KudosTarget;
  watermark: string;
}

/**
 * Interface containing the arguments that 3rd parties use to
 * initialize this PCD package.
 */
export interface SemaphoreSignatureKudosPCDInitArgs {
  /**
   * This function lets the PCD Card Body UI create a QR code from a PCD, which,
   * when scanned, directs a scanner to a webpage that verifies whether this PCD
   * is valid.
   */
  makeEncodedVerifyLink?: (encodedPCD: string) => string;
}

// Stores the initialization arguments for this PCD Package, which are used by
// either `prove` or `verify` to initialize the required objects the first time either is called.
export let initArgs: SemaphoreSignatureKudosPCDInitArgs;

/**
 * Initializes this {@link SemaphoreSignatureKudosPCDPackage}.
 */
async function init(args: SemaphoreSignatureKudosPCDInitArgs): Promise<void> {
  initArgs = args;
}

/**
 * Defines the essential parameters required for creating an {@link SemaphoreSignatureKudosPCD}.
 */
export type SemaphoreSignatureKudosPCDArgs = {
  identity: PCDArgument<SemaphoreIdentityPCD>;
  data: ObjectArgument<IKudosData>;
};

/**
 * Defines the Semaphore Signature Kudos PCD claim. The claim contains data that was signed
 * with the private key corresponding to the given public key stored in the proof.
 */
export interface SemaphoreSignatureKudosPCDClaim {
  data: IKudosData;
}

/**
 * Defines the Semaphore Signature Kudos PCD proof. The proof is an Semaphore Signature PCD whose message
 * is the encoded data.
 */
export interface SemaphoreSignatureKudosPCDProof {
  semaphoreSignaturePCD: SemaphoreSignaturePCD;
}

/**
 * The Semaphore Signature Kudos PCD enables the verification that a specific  {@link SemaphoreSignatureKudosPCDClaim}
 * has been proven with a Semaphore identity. The {@link SemaphoreSignatureKudosPCDProof} contains a Semaphore Signature
 * PCD and serves as the proof for this PCD.
 */
export class SemaphoreSignatureKudosPCD
  implements
    PCD<SemaphoreSignatureKudosPCDClaim, SemaphoreSignatureKudosPCDProof>
{
  type = SemaphoreSignatureKudosPCDTypeName;
  claim: SemaphoreSignatureKudosPCDClaim;
  proof: SemaphoreSignatureKudosPCDProof;
  id: string;

  public constructor(
    id: string,
    claim: SemaphoreSignatureKudosPCDClaim,
    proof: SemaphoreSignatureKudosPCDProof
  ) {
    this.id = id;
    this.claim = claim;
    this.proof = proof;
  }
}

/**
 * Creates a new {@link SemaphoreSignatureKudosPCD} by generating an {@link SemaphoreSignatureKudosPCDProof}
 * and deriving an {@link SemaphoreSignatureKudosPCDClaim} from the given {@link SemaphoreSignatureKudosPCDArgs}.
 */
export async function prove(
  args: SemaphoreSignatureKudosPCDArgs
): Promise<SemaphoreSignatureKudosPCD> {
  if (!initArgs) {
    throw new Error("package not initialized");
  }

  if (!args.identity.value?.pcd) {
    throw new Error("cannot make kudos proof: identity is not set");
  }

  if (!args.data.value) {
    throw new Error("cannot make kudos proof: missing data value");
  }

  // Custom parser?
  const seralizedData = stableStringify(args.data.value);

  // Creates an EdDSA PCD where the message is a serialized data
  const semaphoreSignaturePCD = await SemaphoreSignaturePCDPackage.prove({
    identity: args.identity,
    signedMessage: {
      argumentType: ArgumentTypeName.String,
      value: seralizedData
    }
  });

  return new SemaphoreSignatureKudosPCD(
    uuid(),
    { data: args.data.value },
    { semaphoreSignaturePCD }
  );
}

/**
 * Verifies an Semaphore Signature Kudos PCD by checking that its {@link SemaphoreSignatureKudosPCDClaim} corresponds to
 * its {@link SemaphoreSignatureKudosPCDProof}. If they match, the function returns true, otherwise false.
 * In most cases, verifying the validity of the PCD with this function is not enough.
 * It may also be necessary to check the public key of the
 * entity that signed the claim and verify the authenticity of the entity.
 */
export async function verify(
  pcd: SemaphoreSignatureKudosPCD
): Promise<boolean> {
  if (!initArgs) {
    throw new Error("package not initialized");
  }

  const messageDerivedFromClaim = stableStringify(pcd.claim.data);

  return (
    _.isEqual(
      messageDerivedFromClaim,
      pcd.proof.semaphoreSignaturePCD.claim.signedMessage
    ) && SemaphoreSignaturePCDPackage.verify(pcd.proof.semaphoreSignaturePCD)
  );
}

/**
 * Serializes an {@link SemaphoreSignatureKudosPCD}.
 * @param pcd The Semaphore Signature Kudos PCD to be serialized.
 * @returns The serialized version of the Semaphore Signature Kudos PCD.
 */
export async function serialize(
  pcd: SemaphoreSignatureKudosPCD
): Promise<SerializedPCD<SemaphoreSignatureKudosPCD>> {
  if (!initArgs) {
    throw new Error("package not initialized");
  }

  const serializedSemaphoreSignaturePCD =
    await SemaphoreSignaturePCDPackage.serialize(
      pcd.proof.semaphoreSignaturePCD
    );

  return {
    type: SemaphoreSignatureKudosPCDTypeName,
    pcd: JSONBig().stringify({
      id: pcd.id,
      semaphoreSignaturePCD: serializedSemaphoreSignaturePCD,
      data: pcd.claim.data
    })
  } as SerializedPCD<SemaphoreSignatureKudosPCD>;
}

/**
 * Deserializes a serialized {@link SemaphoreSignatureKudosPCD}.
 * @param serialized The serialized PCD to deserialize.
 * @returns The deserialized version of the Semaphore Signature Kudos PCD
 */
export async function deserialize(
  serialized: string
): Promise<SemaphoreSignatureKudosPCD> {
  if (!initArgs) {
    throw new Error("package not initialized");
  }
  const deserializedWrapper = JSONBig().parse(serialized);
  console.log({ deserializedWrapper });
  const deserializedSemaphoreSignaturePCD =
    await SemaphoreSignaturePCDPackage.deserialize(
      deserializedWrapper.semaphoreSignaturePCD.pcd
    );
  return new SemaphoreSignatureKudosPCD(
    deserializedWrapper.id,
    { data: deserializedWrapper.data },
    { semaphoreSignaturePCD: deserializedSemaphoreSignaturePCD }
  );
}

/**
 * Provides the information about the {@link SemaphoreSignatureKudosPCD} that will be displayed
 * to users on Zupass.
 * @param pcd The Semaphore Signature Kudos PCD instance.
 * @returns The information to be displayed, specifically `header` and `displayName`.
 */
export function getDisplayOptions(
  pcd: SemaphoreSignatureKudosPCD
): DisplayOptions {
  if (!initArgs) {
    throw new Error("package not initialized");
  }

  const kudosData = pcd.claim.data;
  if (!kudosData) {
    return {
      header: "Kudos",
      displayName: "kudos-" + pcd.id.substring(0, 4)
    };
  }

  const header = `${pcd.proof.semaphoreSignaturePCD.claim.identityCommitment} gave @${kudosData.target} a kudos`;

  return {
    header,
    displayName: header
  };
}

/**
 * Returns true if a PCD is an Semaphore Signature Kudos PCD, or false otherwise.
 */
export function isSemaphoreSignatureKudosPCD(
  pcd: PCD
): pcd is SemaphoreSignatureKudosPCD {
  return pcd.type === SemaphoreSignatureKudosPCDTypeName;
}

export function getProveDisplayOptions(): ProveDisplayOptions<SemaphoreSignatureKudosPCDArgs> {
  return {};
}

/**
 * The PCD package of the Semaphore Signature Kudos PCD. It exports an object containing
 * the code necessary to operate on this PCD data.
 */
export const SemaphoreSignatureKudosPCDPackage: PCDPackage<
  SemaphoreSignatureKudosPCDClaim,
  SemaphoreSignatureKudosPCDProof,
  SemaphoreSignatureKudosPCDArgs,
  SemaphoreSignatureKudosPCDInitArgs
> = {
  name: SemaphoreSignatureKudosPCDTypeName,
  renderCardBody: SemaphoreSignatureKudosPCDCardBody,
  getDisplayOptions,
  init,
  getProveDisplayOptions,
  prove,
  verify,
  serialize,
  deserialize
};
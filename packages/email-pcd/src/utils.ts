import { EDdSAPublicKey } from "@pcd/eddsa-pcd";
import { textToBigint } from "bigint-conversion";
import { EmailPCD, IEmailData } from "./EmailPCD";

/**
 * One big int for each signed field in {@link IEmailData}
 */
export type SerializedEmail = [bigint];

export function emailDataToBigInts(data: IEmailData): SerializedEmail {
  return [textToBigint(data.email)];
}

export function getEmailData(pcd?: EmailPCD): IEmailData | undefined {
  return pcd?.claim?.email;
}

export function getPublicKey(pcd?: EmailPCD): EDdSAPublicKey | undefined {
  return pcd?.proof?.eddsaPCD?.claim?.publicKey;
}

//const INVALID_TICKET_QR_CODE_COLOR = "#d3d3d3";

export function getQRCodeColorOverride(_pcd: EmailPCD): string | undefined {
  return undefined;
}

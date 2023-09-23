import urlJoin from "url-join";
import {
  DeviceLoginRequest,
  PCDpassUserJson,
  UserResponseValue
} from "../RequestTypes";
import { APIResult } from "./apiResult";
import { httpPostSimple } from "./makeRequest";

/**
 * Designed for volunteers at the coworking space. Users can login with
 * the secret on their ticket, if they are a superuser.
 *
 * Never rejects. All information encoded in the resolved response.
 */
export async function requestDeviceLogin(
  passportServerUrl: string,
  email: string,
  secret: string,
  commitment: string
): Promise<DeviceLoginResult> {
  return httpPostSimple(
    urlJoin(passportServerUrl, `pcdpass/device-login`),
    async (resText) => ({
      value: JSON.parse(resText) as PCDpassUserJson,
      success: true
    }),
    {
      email,
      secret,
      commitment
    } satisfies DeviceLoginRequest
  );
}

export type DeviceLoginResult = APIResult<UserResponseValue>;

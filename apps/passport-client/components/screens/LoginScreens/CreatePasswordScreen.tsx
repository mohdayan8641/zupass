import { requestVerifyToken } from "@pcd/passport-interface";
import { sleep } from "@pcd/util";
import { useCallback, useEffect, useState } from "react";
import { appConfig } from "../../../src/appConfig";
import { useDispatch, useQuery, useSelf } from "../../../src/appHooks";
import { validateEmail } from "../../../src/util";
import { CenterColumn, H2, HR, Spacer, TextCenter } from "../../core";
import { LinkButton } from "../../core/Button";
import { RippleLoader } from "../../core/RippleLoader";
import { AppContainer } from "../../shared/AppContainer";
import { NewPasswordForm } from "../../shared/NewPasswordForm";

export function CreatePasswordScreen() {
  const dispatch = useDispatch();
  const self = useSelf();
  const query = useQuery();
  const email = query?.get("email");
  const token = query?.get("token");
  const [error, setError] = useState<string | undefined>();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revealPassword, setRevealPassword] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);

  const redirectToLoginPageWithError = useCallback((e: Error | string) => {
    console.error(e);
    window.location.hash = "#/login";
    window.location.reload();
  }, []);

  const checkIfShouldRedirect = useCallback(async () => {
    if (!email || !validateEmail(email) || !token) {
      return redirectToLoginPageWithError(
        "Invalid email or token, redirecting to login"
      );
    }

    const verifyTokenResult = await requestVerifyToken(
      appConfig.zupassServer,
      email,
      token
    );

    if (!verifyTokenResult.success) {
      return redirectToLoginPageWithError(
        "Invalid email or token, redirecting to login"
      );
    }
  }, [email, redirectToLoginPageWithError, token]);

  useEffect(() => {
    checkIfShouldRedirect();
  }, [checkIfShouldRedirect]);

  useEffect(() => {
    // Redirect to home if already logged in
    if (self != null) {
      window.location.hash = "#/";
    }
  }, [self]);

  const onSetPassword = useCallback(async () => {
    try {
      setSettingPassword(true);
      await sleep(10);
      await dispatch({
        type: "login",
        email,
        token,
        password
      });
    } finally {
      setSettingPassword(false);
    }
  }, [dispatch, email, password, token]);

  let content = null;

  if (settingPassword) {
    content = (
      <CenterColumn>
        <Spacer h={128} />
        <RippleLoader />
        <Spacer h={24} />
        <TextCenter>Creating your account...</TextCenter>
      </CenterColumn>
    );
  } else {
    content = (
      <>
        <Spacer h={64} />
        <TextCenter>
          <H2>Set Password</H2>
          <Spacer h={24} />
          Choose a secure, unique password. This password will be used to
          generate your key to encrypt your data. Save your password somewhere
          secure.
        </TextCenter>
        <Spacer h={24} />

        <CenterColumn>
          <NewPasswordForm
            error={error}
            setError={setError}
            autoFocus
            email={email}
            password={password}
            confirmPassword={confirmPassword}
            setPassword={setPassword}
            setConfirmPassword={setConfirmPassword}
            revealPassword={revealPassword}
            setRevealPassword={setRevealPassword}
            submitButtonText="Continue"
            onSuccess={onSetPassword}
          />
          <Spacer h={24} />
          <HR />
          <Spacer h={24} />
          <LinkButton to={"/"}>Cancel</LinkButton>
        </CenterColumn>
      </>
    );
  }

  return (
    <AppContainer bg="primary">
      {content}
      <Spacer h={64} />
    </AppContainer>
  );
}
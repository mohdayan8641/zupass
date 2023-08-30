import { Spacer } from "@pcd/passport-ui";
import { useEffect } from "react";
import { useLoadedIssuedPCDs } from "../../src/appHooks";
import { useSyncE2EEStorage } from "../../src/useSyncE2EEStorage";
import { BackgroundGlow, CenterColumn } from "../core";
import { RippleLoader } from "../core/RippleLoader";
import { MaybeModal } from "../modals/Modal";
import { AppContainer } from "../shared/AppContainer";

// todo: handle case when user is logged in - they shouldn't be able to get to this screen
export function LoginInterstitialScreen() {
  useSyncE2EEStorage();

  const loadedIssuedPCDs = useLoadedIssuedPCDs();

  useEffect(() => {
    if (loadedIssuedPCDs) {
      window.location.href = "#/";
    }
  }, [loadedIssuedPCDs]);

  // todo: style this
  return (
    <>
      <MaybeModal />
      <AppContainer bg="primary">
        <BackgroundGlow
          y={224}
          from="var(--bg-lite-primary)"
          to="var(--bg-dark-primary)"
        >
          <Spacer h={64} />
          <CenterColumn w={280}>
            <RippleLoader />
          </CenterColumn>
        </BackgroundGlow>
      </AppContainer>
    </>
  );
}

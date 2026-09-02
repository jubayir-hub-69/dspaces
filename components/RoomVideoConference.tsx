"use client";

import * as React from "react";
import {
  Chat,
  ControlBar,
  GridLayout,
  FocusLayout,
  FocusLayoutContainer,
  LayoutContextProvider,
  RoomAudioRenderer,
  ConnectionStateToast,
  useTracks,
  usePinnedTracks,
  useCreateLayoutContext,
  ParticipantTileWrapper,
  CarouselView,
  type VideoConferenceProps,
} from "@dtelecom/components-react";
import {
  isEqualTrackRef,
  isMobileBrowser,
  isTrackReference,
  log,
  type TrackReferenceOrPlaceholder,
  type WidgetState,
} from "@dtelecom/components-core";
import { RemoteTrackPublication, RoomEvent, Track, VideoQuality } from "@dtelecom/livekit-client";
import { IdentifiedChatEntry } from "./IdentifiedChatEntry";

const MOBILE_CHAT_SHELL =
  "max-md:absolute max-md:inset-x-0 max-md:bottom-[5.5rem] max-md:z-50 max-md:flex max-md:h-[80vh] max-md:max-h-[calc(100%-5.5rem)] max-md:w-full max-md:max-w-full max-md:flex-col max-md:overflow-hidden max-md:rounded-t-2xl max-md:border max-md:border-white/10 max-md:bg-[#0b1220] max-md:shadow-2xl md:relative md:contents";

/**
 * LiveKit VideoConference with mobile chat overlay + identified chat bubbles.
 * Track/layout behavior is kept in sync with the upstream prefab.
 */
export function RoomVideoConference({
  chatMessageFormatter,
  onKick,
  onMute,
  isAdmin,
  localIdentity,
  gridLayouts,
  chatContext,
  languageOptions,
  supportedChatMessageTypes,
  aiAgentEnabled = false,
  chatWidgetState,
  ...props
}: VideoConferenceProps) {
  const [widgetState, setWidgetState] = React.useState<WidgetState>({
    showChat: false,
    unreadMessages: 0,
    unreadTranscriptions: 0,
    ...chatWidgetState,
  });

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged] }
  );

  const widgetUpdate = (state: WidgetState) => {
    log.debug("updating widget state", state);
    setWidgetState(state);
  };

  const layoutContext = useCreateLayoutContext({ initialWidgetState: widgetState });

  const screenShareTracks = tracks
    .filter(isTrackReference)
    .filter((track) => track.publication.source === Track.Source.ScreenShare);

  const aiAgentTrack = tracks.find((t) => t.participant.identity === "ai_agent");
  const focusTrack = usePinnedTracks(layoutContext)?.[0];
  const carouselTracks = tracks.filter((track) => {
    if (focusTrack && isEqualTrackRef(focusTrack, track)) {
      return false;
    }
    return !(!focusTrack && aiAgentTrack && isEqualTrackRef(aiAgentTrack, track));
  });
  const tracksWithTrackReference = tracks.filter(isTrackReference);
  const enabledVisibleTracks = tracksWithTrackReference.filter(
    (t) => t.publication.isEnabled && t.publication.track?.attachedElements[0]
  );

  const pickTrackQuality = () => {
    if (focusTrack) {
      return VideoQuality.LOW;
    }
    if (enabledVisibleTracks.length > 6) {
      return VideoQuality.LOW;
    }
    if (enabledVisibleTracks.length > 3) {
      return VideoQuality.MEDIUM;
    }
    return VideoQuality.HIGH;
  };

  React.useEffect(() => {
    if (screenShareTracks.length > 0 && focusTrack === undefined) {
      layoutContext.pin.dispatch?.({ msg: "set_pin", trackReference: screenShareTracks[0] });
    } else if (
      (screenShareTracks.length === 0 && focusTrack?.source === Track.Source.ScreenShare) ||
      tracks.length <= 1
    ) {
      layoutContext.pin.dispatch?.({ msg: "clear_pin" });
    }

    updateTracksQuality();
  }, [
    JSON.stringify(screenShareTracks.map((ref) => ref.publication.trackSid)),
    JSON.stringify(enabledVisibleTracks.map((ref) => ref.publication.trackSid)),
    tracksWithTrackReference.length,
    focusTrack?.publication?.trackSid,
  ]);

  const updateTracksQuality = () => {
    let tracksToUpdate: TrackReferenceOrPlaceholder[] = tracksWithTrackReference;
    if (focusTrack) {
      tracksToUpdate = carouselTracks;
      if (focusTrack.publication instanceof RemoteTrackPublication) {
        focusTrack.publication.setVideoQuality(VideoQuality.HIGH);
      }
    }

    tracksToUpdate.forEach((t) => {
      if (t.publication instanceof RemoteTrackPublication) {
        t.publication.setVideoQuality(pickTrackQuality());
      }
    });
  };

  const isMobile = React.useMemo(() => isMobileBrowser(), []);
  const showGridLayout = aiAgentEnabled ? !focusTrack && isMobile : !focusTrack;

  return (
    <div className="lk-video-conference" {...props}>
      <LayoutContextProvider value={layoutContext} onWidgetChange={widgetUpdate}>
        <div className="lk-video-conference-inner">
          {showGridLayout ? (
            <div className="lk-grid-layout-wrapper">
              <GridLayout tracks={tracks} gridLayouts={gridLayouts} aiAgentEnabled={aiAgentEnabled}>
                <ParticipantTileWrapper
                  onKick={onKick}
                  onMute={onMute}
                  localIdentity={localIdentity}
                />
              </GridLayout>
            </div>
          ) : (
            <div className="lk-focus-layout-wrapper">
              <FocusLayoutContainer>
                {aiAgentEnabled ? (
                  (focusTrack || aiAgentTrack) ? <FocusLayout track={focusTrack || aiAgentTrack} /> : null
                ) : (
                  <FocusLayout track={focusTrack} />
                )}
                <CarouselView tracks={carouselTracks}>
                  <ParticipantTileWrapper
                    onKick={onKick}
                    onMute={onMute}
                    localIdentity={localIdentity}
                  />
                </CarouselView>
              </FocusLayoutContainer>
            </div>
          )}
          <ControlBar isAdmin={isAdmin} controls={{ chat: true }} />
        </div>
        <div className={widgetState.showChat ? MOBILE_CHAT_SHELL : "hidden md:contents"}>
          <Chat
            chatContext={chatContext}
            style={{ display: widgetState.showChat ? "flex" : "none" }}
            messageFormatter={chatMessageFormatter}
            languageOptions={languageOptions}
            supportedChatMessageTypes={supportedChatMessageTypes}
          >
            <IdentifiedChatEntry />
          </Chat>
        </div>
      </LayoutContextProvider>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}

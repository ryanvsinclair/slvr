"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  initIpodScene,
  type IpodSceneHandle,
} from "@/lib/ipod/initIpodScene";

export type RoomExperienceHandle = {
  startOutro: () => Promise<void>;
};

type RoomExperienceProps = {
  transition?: boolean;
  onExit?: () => void | Promise<void>;
  onFirstFrame?: () => void;
  onIntroComplete?: () => void;
};

const RoomExperience = forwardRef<RoomExperienceHandle, RoomExperienceProps>(
  function RoomExperience(
    {
      transition = false,
      onExit,
      onFirstFrame: onFirstFrameProp,
      onIntroComplete: onIntroCompleteProp,
    },
    ref,
  ) {
    const appRef = useRef<HTMLDivElement>(null);
    const css3dRef = useRef<HTMLDivElement>(null);
    const closeProjRef = useRef<HTMLButtonElement>(null);
    const hintRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<IpodSceneHandle | null>(null);
    const leavingRef = useRef(false);
    const router = useRouter();
    const [fading, setFading] = useState(false);

    useImperativeHandle(ref, () => ({
      startOutro: () => sceneRef.current?.startOutro() ?? Promise.resolve(),
    }));

    const handleLeave = useCallback(async () => {
      if (onExit) {
        await onExit();
        return;
      }
      if (leavingRef.current) return;
      leavingRef.current = true;
      await (sceneRef.current?.startOutro() ?? Promise.resolve());
      setFading(true);
      await new Promise((r) => setTimeout(r, 420));
      router.push("/");
    }, [onExit, router]);

    useEffect(() => {
      if (
        !appRef.current ||
        !css3dRef.current ||
        !closeProjRef.current ||
        !hintRef.current
      ) {
        return;
      }

      const handle = initIpodScene(
        {
          app: appRef.current,
          css3d: css3dRef.current,
          closeProj: closeProjRef.current,
          hint: hintRef.current,
        },
        {
          transition,
          onFirstFrame: onFirstFrameProp,
          onIntroComplete: onIntroCompleteProp,
        },
      );

      sceneRef.current = handle;
      return () => {
        handle.dispose();
        sceneRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transition]);

    return (
      <>
        <nav className="projects-nav">
          {onExit ? (
            <button type="button" className="projects-nav-exit" onClick={handleLeave}>
              SLVR
            </button>
          ) : (
            <Link href="/">SLVR</Link>
          )}
        </nav>
        <div id="css3d" ref={css3dRef} />
        <div id="app" ref={appRef} />
        <button type="button" className="close-proj" ref={closeProjRef}>
          ✕ Stop projection
        </button>
        <button type="button" className="leave-room" onClick={handleLeave}>
          ← Leave room
        </button>
        <div className="hint" ref={hintRef}>
          Click the iPod to explore
        </div>
        <div className={`room-fade${fading ? " is-active" : ""}`} aria-hidden />
      </>
    );
  },
);

export default RoomExperience;

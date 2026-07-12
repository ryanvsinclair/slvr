"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import type { RoomExperienceHandle } from "@/components/RoomExperience";
import {
  SCROLL_ROOM_ENTRY,
  SCROLL_ROOM_COUPLE_LINE,
  SCROLL_ROOM_COUPLE_LINE_MOBILE,
  SCROLL_ROOM_ENTRY_OVERSCROLL,
} from "@/config/roomEntry";

const RoomExperience = dynamic(() => import("@/components/RoomExperience"), {
  ssr: false,
});

type RoomPhase = "idle" | "expanding" | "active" | "exiting";

type OverlayRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const EXPAND_MS = 900;
const COPY_FADE_MS = 400;
const SCENE_MOUNT_MS = 650;
const WEBGL_FADE_MS = 750;

const delay = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function captureRect(el: HTMLElement): OverlayRect {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function interpolateOverlayRect(
  rect: OverlayRect,
  progress: number,
): CSSProperties {
  const t = clamp(progress, 0, 1);
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  return {
    top: lerp(rect.top, 0, t),
    left: lerp(rect.left, 0, t),
    width: lerp(rect.width, vw, t),
    height: lerp(rect.height, vh, t),
  };
}

function viewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

function scrollCoupleLine() {
  return window.matchMedia("(max-width: 768px), (hover: none) and (pointer: coarse)")
    .matches
    ? SCROLL_ROOM_COUPLE_LINE_MOBILE
    : SCROLL_ROOM_COUPLE_LINE;
}

export default function LandingPage() {
  const roomRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<RoomExperienceHandle>(null);
  const phaseRef = useRef<RoomPhase>("idle");
  const exitingRef = useRef(false);
  const exitViaBackRef = useRef(false);
  const anchorRectRef = useRef<OverlayRect | null>(null);
  const anchorStartTopRef = useRef(0);
  const scrollEntryCommitted = useRef(false);
  const scrollExitLockRef = useRef(false);
  const scenePrefetch = useRef<Promise<
    typeof import("@/lib/ipod/initIpodScene")
  > | null>(null);

  const [phase, setPhase] = useState<RoomPhase>("idle");
  const [overlayRect, setOverlayRect] = useState<OverlayRect | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [copyHidden, setCopyHidden] = useState(false);
  const [mountScene, setMountScene] = useState(false);
  const [webglVisible, setWebglVisible] = useState(false);

  phaseRef.current = phase;

  const scrollAboveRoom = useCallback((behavior: ScrollBehavior = "auto") => {
    const approach = document.getElementById("approach");
    if (approach) {
      approach.scrollIntoView({ block: "end", behavior });
      return;
    }
    const room = roomRef.current;
    if (!room) return;
    window.scrollTo({
      top: Math.max(0, room.offsetTop - window.innerHeight * 0.45),
      behavior,
    });
  }, []);

  const resetScrollEntry = useCallback(() => {
    anchorRectRef.current = null;
    anchorStartTopRef.current = 0;
    scrollEntryCommitted.current = false;
    setScrollProgress(0);
  }, []);

  const resetRoom = useCallback(() => {
    setPhase("idle");
    setExpanded(false);
    setCopyHidden(false);
    setMountScene(false);
    setWebglVisible(false);
    setOverlayRect(null);
    resetScrollEntry();
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    exitingRef.current = false;
    exitViaBackRef.current = false;

    if (SCROLL_ROOM_ENTRY) {
      scrollExitLockRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollAboveRoom("smooth"));
      });
    }
  }, [resetScrollEntry, scrollAboveRoom]);

  const refreshRoomRect = useCallback(() => {
    if (!roomRef.current) return;
    if (!SCROLL_ROOM_ENTRY) {
      roomRef.current.scrollIntoView({ block: "center", behavior: "auto" });
    }
    setOverlayRect(captureRect(roomRef.current));
  }, []);

  const finishScrollEntry = useCallback(() => {
    if (phaseRef.current !== "idle" || scrollEntryCommitted.current) return;

    scrollEntryCommitted.current = true;
    setScrollProgress(1);
    setPhase("expanding");
    setExpanded(true);
    setCopyHidden(true);
    setMountScene(true);
    setWebglVisible(false);
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.history.pushState({ room: true }, "", "/projects");

    if (!scenePrefetch.current) {
      scenePrefetch.current = import("@/lib/ipod/initIpodScene");
    }
  }, []);

  const exitRoom = useCallback(async () => {
    if (
      exitingRef.current ||
      (phaseRef.current !== "active" && phaseRef.current !== "expanding")
    ) {
      return;
    }

    exitingRef.current = true;
    setPhase("exiting");

    // Keep the WebGL layer visible until the scene outro finishes (screen
    // rollup → iPod return → intro reverse). Only then fade and shrink.
    await (sceneRef.current?.startOutro() ?? Promise.resolve());
    setWebglVisible(false);
    await delay(WEBGL_FADE_MS);

    setMountScene(false);
    setCopyHidden(false);
    refreshRoomRect();

    await delay(120);
    setExpanded(false);
    await delay(EXPAND_MS);

    if (!exitViaBackRef.current && window.location.pathname === "/projects") {
      window.history.back();
    }

    resetRoom();
    exitViaBackRef.current = false;
  }, [refreshRoomRect, resetRoom]);

  const updateScrollEntry = useCallback(() => {
    if (
      !SCROLL_ROOM_ENTRY ||
      phaseRef.current !== "idle" ||
      scrollEntryCommitted.current
    ) {
      return;
    }

    const room = roomRef.current;
    if (!room) return;

    const rect = room.getBoundingClientRect();
    const vh = viewportHeight();
    const coupleLine = scrollCoupleLine();
    const roomDocTop = room.offsetTop;

    if (scrollExitLockRef.current) {
      if (window.scrollY < roomDocTop - vh * 0.35) {
        scrollExitLockRef.current = false;
      } else {
        return;
      }
    }

    if (!anchorRectRef.current) {
      if (rect.top >= vh * coupleLine || rect.bottom <= 0) {
        return;
      }

      const anchor = captureRect(room);
      anchorRectRef.current = anchor;
      anchorStartTopRef.current = Math.max(anchor.top, 1);
      setOverlayRect(anchor);

      if (anchor.top <= -SCROLL_ROOM_ENTRY_OVERSCROLL) {
        finishScrollEntry();
        return;
      }
    }

    const startTop = anchorStartTopRef.current;
    if (startTop <= 0) {
      if (rect.top <= -SCROLL_ROOM_ENTRY_OVERSCROLL) finishScrollEntry();
      return;
    }

    if (rect.top >= startTop + 12) {
      resetScrollEntry();
      setOverlayRect(null);
      return;
    }

    const progress = clamp(1 - rect.top / startTop, 0, 1);
    setScrollProgress(progress);

    if (rect.top <= -SCROLL_ROOM_ENTRY_OVERSCROLL) {
      finishScrollEntry();
    }
  }, [finishScrollEntry, resetScrollEntry]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !scenePrefetch.current) {
          scenePrefetch.current = import("@/lib/ipod/initIpodScene");
        }
      },
      { threshold: 0.15, rootMargin: "120px" },
    );

    observer.observe(room);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!SCROLL_ROOM_ENTRY) return;

    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateScrollEntry();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("touchmove", onScroll, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("scroll", onScroll);
    vv?.addEventListener("resize", onScroll);
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("touchmove", onScroll);
      vv?.removeEventListener("scroll", onScroll);
      vv?.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [updateScrollEntry]);

  useEffect(() => {
    if (phase !== "expanding") return;

    const copyTimer = window.setTimeout(() => setCopyHidden(true), COPY_FADE_MS);
    const mountTimer = window.setTimeout(() => {
      setMountScene(true);
      if (!scenePrefetch.current) {
        scenePrefetch.current = import("@/lib/ipod/initIpodScene");
      }
    }, SCENE_MOUNT_MS);
    const activeTimer = window.setTimeout(() => setPhase("active"), EXPAND_MS);

    return () => {
      window.clearTimeout(copyTimer);
      window.clearTimeout(mountTimer);
      window.clearTimeout(activeTimer);
    };
  }, [phase]);

  useEffect(() => {
    const onPopState = () => {
      if (
        phaseRef.current === "active" ||
        phaseRef.current === "expanding"
      ) {
        exitViaBackRef.current = true;
        void exitRoom();
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [exitRoom]);

  const handleFirstFrame = useCallback(() => setWebglVisible(true), []);

  const enterRoom = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (SCROLL_ROOM_ENTRY || phaseRef.current !== "idle" || !roomRef.current) {
        return;
      }

      setOverlayRect(captureRect(roomRef.current));
      setPhase("expanding");
      setExpanded(false);
      setCopyHidden(false);
      setMountScene(false);
      setWebglVisible(false);
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      window.history.pushState({ room: true }, "", "/projects");

      requestAnimationFrame(() => {
        requestAnimationFrame(() => setExpanded(true));
      });
    },
    [],
  );

  const scrollPreviewActive =
    SCROLL_ROOM_ENTRY &&
    phase === "idle" &&
    overlayRect !== null &&
    scrollProgress > 0;

  const overlayStyle: CSSProperties | undefined = overlayRect
    ? scrollPreviewActive
      ? interpolateOverlayRect(overlayRect, scrollProgress)
      : expanded
        ? { inset: 0, width: "100%", height: "100dvh" }
        : {
            top: overlayRect.top,
            left: overlayRect.left,
            width: overlayRect.width,
            height: overlayRect.height,
          }
    : undefined;

  const overlayCopyHidden =
    copyHidden || (scrollPreviewActive && scrollProgress > 0.45);

  const showOverlay = (phase !== "idle" && overlayRect) || scrollPreviewActive;

  return (
    <div
      className={[
        "landing",
        phase !== "idle" ? "room-entering" : "",
        phase === "exiting" ? "room-exiting" : "",
        scrollPreviewActive ? "room-scroll-preview" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <nav className="nav">
        <Link href="/" className="chrome-logo">
          SLVR
        </Link>
      </nav>

      <header className="hero">
        <div className="hero-inner">
          <p className="label hero-tagline">
            <span>
              <span className="hero-letter">S</span>tand out
            </span>
            <span className="hero-tagline-sep" aria-hidden>
              ·
            </span>
            <span>
              <span className="hero-letter">L</span>aunch bold
            </span>
            <span className="hero-tagline-sep" aria-hidden>
              ·
            </span>
            <span>
              show <span className="hero-letter">V</span>alue
            </span>
            <span className="hero-tagline-sep" aria-hidden>
              ·
            </span>
            <span>
              be <span className="hero-letter">R</span>emembered
            </span>
          </p>
          <h1>
            Your site should be
            <br />
            the reason they{" "}
            <span className="chrome-text">remember you.</span>
          </h1>
        </div>
      </header>

      <section className="statement">
        <div className="label">What we do</div>
        <h2>
          Your reputation was handmade. Your site wasn&apos;t.
        </h2>
        <p className="statement-fix">
          <span className="chrome-text">Let&apos;s fix that.</span>
        </p>
        <p>
          Templates exist for a reason. Wix, Squarespace, WordPress &mdash;
          they&apos;re fast, cheap, and good enough to start. But good enough
          to start is where they end. A template was designed for a million
          businesses at once, which means it was designed for none of them.
          Especially not yours.
        </p>
        <p>
          And people can tell. Once you&apos;ve seen enough template sites, and
          everyone has, you know low effort on sight. So we build the opposite:
          a site designed for exactly one business. Yours. Interactive when it
          counts. Fast on every device. Built to impress before anyone reads a
          word. You work with one person from strategy to launch. No handoffs.
          No guesswork.
        </p>
      </section>

      <section id="approach" className="approach">
        <ul className="outcomes">
          <li>
            <span className="outcomes-kicker">more</span>
            <span className="outcomes-word">reservations</span>
          </li>
          <li>
            <span className="outcomes-kicker">more</span>
            <span className="outcomes-word">inquiries</span>
          </li>
          <li>
            <span className="outcomes-kicker">more</span>
            <span className="outcomes-word">sales</span>
          </li>
        </ul>
      </section>

      <section
        className={`room${SCROLL_ROOM_ENTRY ? " room--scroll-entry" : ""}`}
        id="room"
        ref={roomRef}
        onClick={SCROLL_ROOM_ENTRY ? undefined : enterRoom}
        aria-hidden={phase !== "idle" || scrollPreviewActive}
      >
        <div className="beam" />
        <div className="inner">
          <div className="label">The Projector Room</div>
          <h2>
            See the work
            <br />
            <span className="chrome-text">for yourself.</span>
          </h2>
          {SCROLL_ROOM_ENTRY ? (
            <p className="scroll-cue">Keep scrolling to enter</p>
          ) : (
            <button type="button" className="enter-btn" onClick={enterRoom}>
              Enter the projector room
            </button>
          )}
        </div>
      </section>

      <footer>
        <div>
          <div className="label" style={{ marginBottom: 14 }}>
            Ready to build something different?
          </div>
          <div className="big">
            <a href="mailto:ryan@carlyauto.ca">ryan@carlyauto.ca</a>
          </div>
        </div>
        <div className="fine">© 2026 SLVR · Interactive Web Design</div>
      </footer>

      {showOverlay && (
        <div
          className={[
            "room-overlay",
            expanded ? "is-expanded" : "",
            scrollPreviewActive ? "room-overlay--scroll-driven" : "",
            overlayCopyHidden ? "copy-out" : "",
            webglVisible ? "scene-in" : "",
            webglVisible ? "beam-out" : "",
            phase === "exiting" ? "is-exiting" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={overlayStyle}
        >
          <div className="beam" aria-hidden="true" />
          <div className={`overlay-copy${overlayCopyHidden ? " hidden" : ""}`}>
            <div className="label">The Projector Room</div>
            <h2>
              See the work
              <br />
              <span className="chrome-text">for yourself.</span>
            </h2>
          </div>
          {mountScene && (
            <div className="scene-layer">
              <div className="projects-page projects-page--embedded">
                <RoomExperience
                  ref={sceneRef}
                  transition
                  onExit={exitRoom}
                  onFirstFrame={handleFirstFrame}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

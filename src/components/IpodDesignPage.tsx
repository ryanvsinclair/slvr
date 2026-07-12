"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_IPOD_BODY_PARAMS,
  paramsToTypeScript,
  type IpodBodyParams,
} from "@/lib/ipod/ipodBody";
import { initIpodDesignScene } from "@/lib/ipod/initIpodDesignScene";

type SliderSpec = {
  key: keyof IpodBodyParams;
  label: string;
  min: number;
  max: number;
  step: number;
  section: string;
};

const SLIDERS: SliderSpec[] = [
  { key: "bendReach", label: "Bend reach", min: 0.05, max: 0.95, step: 0.005, section: "Face curve" },
  { key: "bendDepth", label: "Bend depth", min: 0.002, max: 0.04, step: 0.001, section: "Face curve" },
  { key: "bendPower", label: "Bend power (0 = smooth)", min: 0, max: 4, step: 0.1, section: "Face curve" },
  { key: "plateTopZ", label: "Face top Z", min: 0.12, max: 0.18, step: 0.001, section: "Face curve" },
  { key: "edgeDrop", label: "Edge drop", min: 0.002, max: 0.03, step: 0.001, section: "Face curve" },
  { key: "rimWidth", label: "Rim width", min: 0.003, max: 0.02, step: 0.001, section: "Face curve" },
  { key: "pillowGridX", label: "Pillow density X", min: 40, max: 240, step: 4, section: "Face curve" },
  { key: "pillowGridY", label: "Pillow density Y", min: 60, max: 320, step: 4, section: "Face curve" },
  { key: "bodyW", label: "Body width", min: 1.0, max: 1.35, step: 0.005, section: "Body" },
  { key: "bodyH", label: "Body height", min: 1.7, max: 2.2, step: 0.005, section: "Body" },
  { key: "cornerR", label: "Corner radius", min: 0.04, max: 0.16, step: 0.005, section: "Body" },
  { key: "sideDepth", label: "Side depth", min: 0.06, max: 0.14, step: 0.001, section: "Body" },
  { key: "faceInset", label: "Face inset (screen)", min: 0.005, max: 0.04, step: 0.001, section: "Body" },
  { key: "chromeRoughness", label: "Face roughness", min: 0.02, max: 0.5, step: 0.01, section: "Materials" },
  { key: "chromeMetalness", label: "Face metalness", min: 0, max: 1, step: 0.05, section: "Materials" },
  { key: "chromeEnvIntensity", label: "Face env intensity", min: 0, max: 1.2, step: 0.05, section: "Materials" },
  { key: "shellRoughness", label: "Shell roughness", min: 0.02, max: 0.5, step: 0.01, section: "Materials" },
  { key: "shellMetalness", label: "Shell metalness", min: 0, max: 1, step: 0.05, section: "Materials" },
  { key: "shellEnvIntensity", label: "Shell env intensity", min: 0, max: 1.2, step: 0.05, section: "Materials" },
  { key: "wheelX", label: "Wheel X", min: -0.1, max: 0.1, step: 0.005, section: "Wheel" },
  { key: "wheelY", label: "Wheel Y", min: 0.45, max: 0.7, step: 0.005, section: "Wheel" },
  { key: "wheelZOffset", label: "Wheel Z offset", min: -0.03, max: 0.03, step: 0.001, section: "Wheel" },
  { key: "wheelInnerR", label: "Wheel inner R", min: 0.12, max: 0.2, step: 0.005, section: "Wheel" },
  { key: "wheelOuterR", label: "Wheel outer R", min: 0.28, max: 0.42, step: 0.005, section: "Wheel" },
  { key: "wheelTop", label: "Button concavity", min: 0.0015, max: 0.01, step: 0.0005, section: "Wheel" },
  { key: "wheelBottom", label: "Wheel bottom", min: 0.002, max: 0.02, step: 0.001, section: "Wheel" },
  { key: "menuRingBias", label: "Menu ring bias", min: 0.45, max: 0.85, step: 0.01, section: "Symbols" },
  { key: "menuSymbolW", label: "Menu width", min: 0.1, max: 0.28, step: 0.005, section: "Symbols" },
  { key: "menuSymbolH", label: "Menu height", min: 0.02, max: 0.07, step: 0.001, section: "Symbols" },
  { key: "iconSymbolW", label: "Side icon width", min: 0.06, max: 0.16, step: 0.005, section: "Symbols" },
  { key: "iconSymbolH", label: "Icon height", min: 0.04, max: 0.09, step: 0.001, section: "Symbols" },
  { key: "playSymbolW", label: "Play icon width", min: 0.05, max: 0.14, step: 0.005, section: "Symbols" },
  { key: "screenW", label: "Screen width", min: 0.85, max: 1.05, step: 0.005, section: "Screen" },
  { key: "screenBottomY", label: "Screen bottom Y", min: 1.0, max: 1.2, step: 0.005, section: "Screen" },
  { key: "screenZ", label: "Screen Z", min: 0.15, max: 0.2, step: 0.001, section: "Screen" },
];

function formatValue(key: keyof IpodBodyParams, value: number) {
  if (key === "pillowGridX" || key === "pillowGridY") return String(Math.round(value));
  return value.toFixed(3);
}

export default function IpodDesignPage() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReturnType<typeof initIpodDesignScene> | null>(null);
  const [params, setParams] = useState<IpodBodyParams>(DEFAULT_IPOD_BODY_PARAMS);
  const [status, setStatus] = useState("Drag to orbit · scroll to zoom");

  const exportText = useMemo(() => paramsToTypeScript(params), [params]);

  const updateParam = useCallback((key: keyof IpodBodyParams, value: number) => {
    setParams((prev) => {
      const next = { ...prev, [key]: value };
      sceneRef.current?.rebuild(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handle = initIpodDesignScene(el, DEFAULT_IPOD_BODY_PARAMS);
    sceneRef.current = handle;
    return () => {
      handle.dispose();
      sceneRef.current = null;
    };
  }, []);

  const sections = useMemo(() => {
    const map = new Map<string, SliderSpec[]>();
    for (const spec of SLIDERS) {
      const list = map.get(spec.section) ?? [];
      list.push(spec);
      map.set(spec.section, list);
    }
    return [...map.entries()];
  }, []);

  const reset = () => {
    setParams(DEFAULT_IPOD_BODY_PARAMS);
    sceneRef.current?.rebuild(DEFAULT_IPOD_BODY_PARAMS);
    setStatus("Reset to defaults");
  };

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setStatus("Copied params to clipboard");
    } catch {
      setStatus("Could not copy — select the export text manually");
    }
  };

  return (
    <div className="design-page">
      <div className="design-page__header">
        <div>
          <h1>iPod geometry</h1>
          <p className="design-page__lede">
            Tweak face curvature, shell, wheel, and screen layout. Copy the export when you are
            happy and paste values into <code>ipodBody.ts</code>.
          </p>
        </div>
        <a className="design-page__back" href="/">
          ← Home
        </a>
      </div>

      <div className="design-page__layout">
        <div className="design-viewport-wrap">
          <div ref={viewportRef} className="design-viewport" />
          <p className="design-viewport__hint">{status}</p>
        </div>

        <aside className="design-panel">
          <div className="design-actions">
            <button type="button" onClick={reset}>
              Reset defaults
            </button>
            <button type="button" className="primary" onClick={copyExport}>
              Copy export
            </button>
          </div>

          {sections.map(([section, specs]) => (
            <section key={section} className="design-section">
              <h2>{section}</h2>
              {specs.map((spec) => (
                <label key={spec.key} className="design-slider">
                  <span className="design-slider__row">
                    <span>{spec.label}</span>
                    <span className="design-slider__value">
                      {formatValue(spec.key, params[spec.key])}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    value={params[spec.key]}
                    onChange={(e) => updateParam(spec.key, Number(e.target.value))}
                  />
                </label>
              ))}
            </section>
          ))}

          <section className="design-section">
            <h2>Export</h2>
            <textarea
              className="design-export"
              readOnly
              value={exportText}
              rows={12}
              onFocus={(e) => e.currentTarget.select()}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

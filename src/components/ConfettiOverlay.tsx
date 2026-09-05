// Hex values in this file are brand/artwork confetti palette data — an allowed exception to the theme-token rule.
import { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Canvas, Circle, Group, Rect } from "@shopify/react-native-skia";
import {
    SharedValue,
    makeMutable,
    useDerivedValue,
    useFrameCallback,
    useSharedValue,
} from "react-native-reanimated";

import { seededRand } from "@utils/seededRandom";

// ─── Palettes ─────────────────────────────────────────────────────────────────
const P: Record<string, string[]> = {
    classic:    ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#C77DFF", "#5EEAD4", "#FF9F43", "#FF6BFF"],
    pastel:     ["#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9", "#BAE1FF", "#E8BAFF", "#FFB3F7", "#B3FFF7"],
    gold:       ["#FFD700", "#FFC107", "#FF9800", "#FFEB3B", "#FFA000", "#FFD54F", "#FFCA28", "#FFB300"],
    neon:       ["#FF0099", "#00FF41", "#00E5FF", "#FFE600", "#FF6600", "#7700FF", "#00FFCC", "#FF0033"],
    rainbow:    ["#FF0000", "#FF7700", "#FFFF00", "#00FF00", "#0000FF", "#8B00FF", "#FF00FF", "#00FFFF"],
    fire:       ["#FF1A00", "#FF4500", "#FF8C00", "#FFC200", "#FFE500", "#FF6347", "#FF3D00", "#FFAB00"],
    ocean:      ["#006994", "#0099CC", "#00B4D8", "#48CAE4", "#90E0EF", "#5EEAD4", "#22D3EE", "#0EA5E9"],
    candy:      ["#FF6EB4", "#FF91D0", "#C77DFF", "#A78BFA", "#60A5FA", "#F472B6", "#E879F9", "#818CF8"],
    forest:     ["#2D6A4F", "#40916C", "#52B788", "#74C69D", "#95D5B2", "#B7E4C7", "#6B8F71", "#1B4332"],
    monochrome: ["#FFFFFF", "#F0F0F0", "#E0E0E0", "#D0D0D0", "#C0C0C0", "#B0B0B0", "#A0A0A0", "#FFFFFF"],
    pride:      ["#FF0018", "#FFA52C", "#FFFF41", "#008018", "#0000F9", "#86007D", "#FF69B4", "#FFFFFF"],
};

const COUNT = 50;
const DEG_TO_RAD = Math.PI / 180;

export type ConfettiVariant =
    | "classic" | "bubbles" | "ribbons" | "squares" | "big"
    | "tiny" | "coins" | "ticker" | "chunky" | "wide"
    | "dots" | "elongated" | "mixed" | "uniform" | "fat_circles"
    | "pastel" | "gold" | "neon" | "rainbow" | "fire"
    | "ocean" | "candy" | "forest" | "monochrome" | "pride"
    | "slow" | "fast" | "burst" | "rise" | "storm" | "float" | "sideways";

// ─── Physics ──────────────────────────────────────────────────────────────────
type SpawnMode = "top" | "bottom" | "center" | "left";

type Physics = {
    gravity:  number;
    spawn:    SpawnMode;
    vxRange:  [number, number];
    vyRange:  [number, number];
    vrScale:  number;
    delayMax: number;
};

const PHYSICS: Partial<Record<ConfettiVariant, Physics>> = {
    slow:     { gravity: 90,  spawn: "top",    vxRange: [-50,  50],  vyRange: [15,  60],  vrScale: 0.35, delayMax: 1200 },
    fast:     { gravity: 900, spawn: "top",    vxRange: [-200, 200], vyRange: [140, 420], vrScale: 2.0,  delayMax: 350  },
    burst:    { gravity: 260, spawn: "center", vxRange: [180,  500], vyRange: [0,   0],   vrScale: 2.2,  delayMax: 180  },
    rise:     { gravity: 180, spawn: "bottom", vxRange: [-130, 130], vyRange: [-480, -100], vrScale: 1.6, delayMax: 600 },
    storm:    { gravity: 480, spawn: "top",    vxRange: [220,  520], vyRange: [50,  220], vrScale: 1.8,  delayMax: 300  },
    float:    { gravity: 30,  spawn: "top",    vxRange: [-25,  25],  vyRange: [8,   28],  vrScale: 0.15, delayMax: 1800 },
    sideways: { gravity: 280, spawn: "left",   vxRange: [160,  380], vyRange: [-40, 160], vrScale: 1.4,  delayMax: 500  },
};

const DEFAULT_PHYSICS: Physics = {
    gravity: 420, spawn: "top", vxRange: [-80, 80], vyRange: [60, 240], vrScale: 1, delayMax: 700,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
type Config = { color: string; w: number; h: number; isCircle: boolean };
type State  = {
    x: number; y: number;
    vx: number; vy: number;
    rotation: number; vr: number;
    opacity: number;
    delay: number;
};
type RenderState = { x: number; y: number; r: number; a: number };

const makeConfigs = (variant: ConfettiVariant): Config[] =>
    Array.from({ length: COUNT }, (_, i) => {
        const r1    = seededRand(i * 9);
        const r2    = seededRand(i * 9 + 1);
        const r3    = seededRand(i * 9 + 2);
        const pal   = P[variant] ?? P.classic;
        const color = pal[i % pal.length];

        switch (variant) {
            case "bubbles":   { const d = 8 + r1 * 14; return { color, w: d, h: d, isCircle: true }; }
            case "ribbons":     return { color, w: 3 + r1 * 3, h: 24 + r2 * 24, isCircle: false };
            case "squares":   { const s = 7 + r1 * 9; return { color, w: s, h: s, isCircle: false }; }
            case "big":       { const d = 14 + r1 * 16; return { color, w: d, h: r3 > 0.5 ? d : d * (1.2 + r2 * 0.8), isCircle: r3 > 0.65 }; }
            case "tiny":        return { color, w: 2 + r1 * 4, h: 2 + r2 * 4, isCircle: r3 > 0.4 };
            case "coins":       return { color, w: 14, h: 14, isCircle: true };
            case "ticker":      return { color, w: 2 + r1 * 2, h: 30 + r2 * 26, isCircle: false };
            case "chunky":    { const s = 12 + r1 * 10; return { color, w: s, h: s * (0.8 + r2 * 0.4), isCircle: r3 > 0.7 }; }
            case "wide":        return { color, w: 14 + r1 * 12, h: 5 + r2 * 5, isCircle: false };
            case "dots":      { const d = 4 + r1 * 6; return { color, w: d, h: d, isCircle: true }; }
            case "elongated":   return { color, w: 4 + r1 * 3, h: 22 + r2 * 20, isCircle: false };
            case "mixed":     { const sc = r3 < 0.25 ? 0.35 : r3 > 0.75 ? 2.2 : 1; return { color, w: (5 + r1 * 8) * sc, h: (7 + r2 * 10) * sc, isCircle: r3 > 0.5 }; }
            case "uniform":     return { color, w: 8, h: 12, isCircle: false };
            case "fat_circles": { const d = 12 + r1 * 10; return { color, w: d, h: d, isCircle: true }; }
            case "burst":
            case "rise":
            case "storm":
            case "float":
            case "sideways":    return { color: P.classic[i % P.classic.length], w: 6 + r1 * 9, h: 10 + r2 * 12, isCircle: r3 > 0.62 };
            default:            return { color, w: 6 + r1 * 9, h: 10 + r2 * 12, isCircle: r3 > 0.62 };
        }
    });

const makeState = (i: number, screenW: number, screenH: number, physics: Physics, speedScale = 1): State => {
    const r3 = seededRand(i * 9 + 3);
    const r4 = seededRand(i * 9 + 4);
    const r5 = seededRand(i * 9 + 5);
    const r6 = seededRand(i * 9 + 6);
    const r7 = seededRand(i * 9 + 7);
    const r8 = seededRand(i * 9 + 8);
    const r9 = seededRand(i * 9 + 9);

    let x: number, y: number, vx: number, vy: number;

    switch (physics.spawn) {
        case "bottom":
            x  = r3 * screenW;
            y  = screenH + 10 + r4 * 30;
            vx = physics.vxRange[0] + r5 * (physics.vxRange[1] - physics.vxRange[0]);
            vy = physics.vyRange[0] + r6 * (physics.vyRange[1] - physics.vyRange[0]);
            break;
        case "center": {
            const angle = r5 * Math.PI * 2;
            const speed = (physics.vxRange[0] + r6 * (physics.vxRange[1] - physics.vxRange[0])) * speedScale;
            x  = screenW / 2 + (r3 - 0.5) * 50;
            y  = screenH / 2 + (r4 - 0.5) * 50;
            vx = Math.cos(angle) * speed;
            vy = Math.sin(angle) * speed;
            break;
        }
        case "left":
            x  = -(10 + r3 * 30);
            y  = r4 * screenH * 0.8;
            vx = physics.vxRange[0] + r5 * (physics.vxRange[1] - physics.vxRange[0]);
            vy = physics.vyRange[0] + r6 * (physics.vyRange[1] - physics.vyRange[0]);
            break;
        default: // top
            x  = r3 * screenW;
            y  = -(20 + r4 * 80);
            vx = physics.vxRange[0] + r5 * (physics.vxRange[1] - physics.vxRange[0]);
            vy = physics.vyRange[0] + r6 * (physics.vyRange[1] - physics.vyRange[0]);
            break;
    }

    return {
        x, y, vx, vy,
        rotation: r7 * 360,
        vr:       (r8 - 0.5) * 480 * physics.vrScale,
        opacity:  0,
        delay:    r9 * physics.delayMax,
    };
};

// ─── Single Skia particle ─────────────────────────────────────────────────────
// Rendered inside a <Canvas> — no native View overhead, drawn in one GPU pass.
const SkiaPiece = ({
    config,
    renderValue,
}: {
    config: Config;
    renderValue: SharedValue<RenderState>;
}) => {
    const transform = useDerivedValue(() => {
        const { x, y, r } = renderValue.value;
        return [{ translateX: x }, { translateY: y }, { rotate: r * DEG_TO_RAD }];
    });
    const opacity = useDerivedValue(() => renderValue.value.a);

    return (
        <Group transform={transform} opacity={opacity}>
            {config.isCircle
                ? <Circle cx={config.w / 2} cy={config.w / 2} r={config.w / 2} color={config.color} />
                : <Rect x={0} y={0} width={config.w} height={config.h} color={config.color} />
            }
        </Group>
    );
};

// ─── Overlay ──────────────────────────────────────────────────────────────────
type Props = { active: boolean; variant?: ConfettiVariant; speedScale?: number };

const ConfettiOverlay = ({ active, variant = "burst", speedScale = 1 }: Props) => {
    const { width, height } = useWindowDimensions();

    const configs = useMemo(() => makeConfigs(variant), [variant]);
    const physics = PHYSICS[variant] ?? DEFAULT_PHYSICS;

    const renderValues = useMemo(
        () => Array.from({ length: COUNT }, () =>
            makeMutable<RenderState>({ x: 0, y: -5000, r: 0, a: 0 })
        ),
        []
    );

    const simStates = useSharedValue<State[]>(
        Array.from({ length: COUNT }, (_, i) => makeState(i, width, height, physics))
    );
    const running = useSharedValue(false);
    const gravity = useSharedValue(physics.gravity);

    useEffect(() => {
        const p = PHYSICS[variant] ?? DEFAULT_PHYSICS;
        gravity.value = p.gravity;
        if (active) {
            simStates.value = Array.from({ length: COUNT }, (_, i) =>
                makeState(i, width, height, p, speedScale)
            );
            for (let i = 0; i < COUNT; i++) {
                renderValues[i].value = { x: 0, y: -5000, r: 0, a: 0 };
            }
            running.value = true;
        } else {
            running.value = false;
        }
    }, [active, variant]);

    useFrameCallback((info) => {
        if (!running.value) return;

        const dt        = Math.min(info.timeSincePreviousFrame ?? 16.67, 33) / 1000;
        const g         = gravity.value;
        const s         = simStates.value;
        const fadeStart = height * 0.72;
        let   anyActive = false;

        for (let i = 0; i < COUNT; i++) {
            const offScreen = s[i].opacity === 0
                && (s[i].y >= height || s[i].x > width + 250 || s[i].x < -250);
            if (offScreen) continue;

            if (s[i].delay > 0) {
                s[i].delay -= dt * 1000;
                anyActive = true;
                continue;
            }

            s[i].y        += s[i].vy * dt;
            s[i].vy       += g * dt;
            s[i].x        += s[i].vx * dt;
            s[i].rotation += s[i].vr * dt;

            const gone = s[i].y >= height || s[i].x > width + 250 || s[i].x < -250;
            if (gone) {
                s[i].opacity = 0;
            } else if (s[i].y > fadeStart) {
                s[i].opacity = 1 - (s[i].y - fadeStart) / (height - fadeStart);
                anyActive = true;
            } else {
                s[i].opacity = Math.min(1, s[i].opacity + dt * 6);
                anyActive = true;
            }

            renderValues[i].value = { x: s[i].x, y: s[i].y, r: s[i].rotation, a: s[i].opacity };
        }

        simStates.value = [...s];
        if (!anyActive) running.value = false;
    });

    if (!active) return null;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Canvas style={StyleSheet.absoluteFill}>
                {configs.map((config, i) => (
                    <SkiaPiece key={i} config={config} renderValue={renderValues[i]} />
                ))}
            </Canvas>
        </View>
    );
};

export default ConfettiOverlay;

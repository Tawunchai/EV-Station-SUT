// src/components/Loader.tsx
import React, { useEffect, useMemo, useState } from "react";
import LogoEV from "../../assets/Logo-Good.png";

type LoaderProps = {
  /** แสดงนานกี่ ms (default 5000) */
  durationMs?: number;
  /** บังคับให้โชว์/ซ่อนจากภายนอก (optional) */
  forceVisible?: boolean;
};

const Loader: React.FC<LoaderProps> = ({ durationMs = 5000, forceVisible }) => {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  // ✅ จำนวนจุดรอบวง (ปรับได้)
  const dots = useMemo(() => Array.from({ length: 10 }), []);

  useEffect(() => {
    if (typeof forceVisible === "boolean") {
      setVisible(forceVisible);
      if (!forceVisible) setLeaving(false);
      return;
    }

    setVisible(true);
    setLeaving(false);

    const timer = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => setVisible(false), 220);
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, forceVisible]);

  if (!visible) return null;

  return (
    <div className={`evl-root ${leaving ? "evl-leave" : ""}`} role="status" aria-live="polite">
      <div className="evl-wrap" aria-label="Loading">
        {/* ✅ วงกลมเล็กสีฟ้าไล่สี วิ่งวนรอบนอก */}
        <div className="evl-orbit" aria-hidden="true">
          {dots.map((_, i) => {
            const angle = (360 / dots.length) * i;

            // สลับขนาดให้ดูเหมือนภาพ (ไม่รก)
            const size = i % 3 === 0 ? 10 : i % 3 === 1 ? 8 : 7;

            return (
              <span
                key={i}
                className="evl-dot"
                style={
                  {
                    "--a": `${angle}deg`,
                    "--s": `${size}px`,
                    "--d": `${i * 0.08}s`,
                  } as React.CSSProperties
                }
              />
            );
          })}
        </div>

        {/* ✅ วงใน (อยู่เฉยๆ ไม่ไล่สี) */}
        <div className="evl-innerRing" aria-hidden="true" />

        {/* ✅ LOGO กลาง (import รูป) */}
        <div className="evl-logoPlate">
          <img className="evl-logo" src={LogoEV} alt="Logo" />
        </div>

        {/* ✅ เงานิ่มๆ ใต้ชุด loader */}
        <div className="evl-shadow" aria-hidden="true" />
      </div>

      <style>
        {`
          .evl-root{
            position: fixed;
            inset: 0;
            z-index: 3000;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            transition: opacity .22s ease, transform .22s ease;
            opacity: 1;
            transform: translateY(0);
          }
          .evl-root.evl-leave{
            opacity: 0;
            transform: translateY(6px);
          }

          .evl-wrap{
            --size: clamp(160px, 30vw, 230px);
            --ring: calc(var(--size) * 0.49);
            position: relative;
            width: var(--size);
            height: var(--size);
            display: grid;
            place-items: center;
          }

          /* =========================
             OUTER DOT ORBIT
          ========================= */
          .evl-orbit{
            position: absolute;
            inset: 0;
            border-radius: 999px;
            animation: evlSpin 1.55s linear infinite;
          }

          @keyframes evlSpin{
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          .evl-dot{
            position: absolute;
            top: 50%;
            left: 50%;
            width: var(--s);
            height: var(--s);
            margin-left: calc(var(--s) / -2);
            margin-top: calc(var(--s) / -2);
            border-radius: 999px;

            /* ✅ ฟ้าไล่สี */
            background: radial-gradient(circle at 30% 30%, #67e8f9, #38bdf8 45%, #0284c7 100%);
            box-shadow: 0 10px 22px rgba(2,132,199,0.18);

            transform:
              rotate(var(--a))
              translateX(var(--ring))
              rotate(calc(var(--a) * -1));

            opacity: 0.9;
            animation: evlDotPulse 1.1s ease-in-out infinite;
            animation-delay: var(--d);
          }

          @keyframes evlDotPulse{
            0%, 100% {
              transform:
                rotate(var(--a))
                translateX(var(--ring))
                rotate(calc(var(--a) * -1))
                scale(1);
              opacity: 0.78;
            }
            50% {
              transform:
                rotate(var(--a))
                translateX(var(--ring))
                rotate(calc(var(--a) * -1))
                scale(1.14);
              opacity: 1;
            }
          }

          /* =========================
             INNER RING (STATIC, NO GRADIENT)
          ========================= */
          .evl-innerRing{
            position: absolute;
            inset: 16%;
            border-radius: 999px;
            background: #ffffff;
            box-shadow:
              inset 0 0 0 1px rgba(2, 6, 23, 0.06),
              0 12px 32px rgba(2, 6, 23, 0.04);
          }

          /* =========================
             LOGO PLATE
          ========================= */
          .evl-logoPlate{
            position: relative;
            width: clamp(110px, 20vw, 150px);
            height: clamp(110px, 20vw, 150px);
            border-radius: 999px;
            background: #ffffff;
            box-shadow:
              0 18px 55px rgba(2, 6, 23, 0.06),
              0 0 0 1px rgba(2, 6, 23, 0.06);
            display: grid;
            place-items: center;
          }

          .evl-logoPlate:before{
            content:"";
            position:absolute;
            inset: 10px;
            border-radius: 999px;
            box-shadow: inset 0 0 0 1px rgba(2,132,199,0.06);
            pointer-events:none;
          }

          .evl-logo{
            width: 78%;
            height: 78%;
            object-fit: contain;
            user-select: none;
            -webkit-user-drag: none;
            filter: drop-shadow(0 10px 18px rgba(2,132,199,0.12));
          }

          /* subtle base shadow */
          .evl-shadow{
            position: absolute;
            bottom: -18px;
            left: 50%;
            transform: translateX(-50%);
            width: 64%;
            height: 18px;
            border-radius: 999px;
            background: radial-gradient(circle at 50% 50%, rgba(2,6,23,0.14), rgba(255,255,255,0) 70%);
            filter: blur(7px);
            opacity: 0.45;
          }

          @media (prefers-reduced-motion: reduce){
            .evl-orbit,
            .evl-dot{
              animation: none !important;
            }
          }
        `}
      </style>
    </div>
  );
};

export default Loader;

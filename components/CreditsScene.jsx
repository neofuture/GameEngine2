"use client";

import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import Link from "next/link";
import {
  DEFAULT_LEVEL_TRACK_ID,
  DEFAULT_LOADING_TRACK_ID,
  MUSIC_TRACKS,
} from "@/lib/Sound";
import "@/app/credits/credits.css";
import CreditsRiflePreview from "@/components/CreditsRiflePreview";
import CreditsBigBangFinale from "@/components/CreditsBigBangFinale";

const CARL = "Carl Fearby";
const SCROLL_SPEED = 95;
const INTRO_DELAY_S = 2;

const SONG_CREDITS = [
  ["Written by", CARL],
  ["Composed by", CARL],
  ["Lyrics by", CARL],
  ["Produced by", CARL],
  ["Co-Produced by", CARL],
  ["Arranged by", CARL],
  ["Programmed by", CARL],
  ["Mixed by", CARL],
  ["Mastered by", CARL],
  ["Performed by", CARL],
  ["All Instruments", CARL],
  ["Vocals", CARL],
  ["Executive Music Producer", CARL],
  ["Published by", `${CARL} Productions`],
];

function trackUsageLabel(trackId) {
  if (trackId === DEFAULT_LOADING_TRACK_ID) return "Loading Screen Theme";
  if (trackId === DEFAULT_LEVEL_TRACK_ID) return "In-Game Theme";
  return "Original Soundtrack";
}

const SECTIONS = [
  {
    title: "Production",
    credits: [
      ["Executive Producer", CARL],
      ["Producer", CARL],
      ["Associate Producer", CARL],
      ["Co-Producer", CARL],
      ["Line Producer", CARL],
      ["Production Manager", CARL],
      ["Production Coordinator", CARL],
      ["Production Assistant", CARL],
      ["Unit Production Manager", CARL],
      ["Production Accountant", CARL],
      ["Production Legal Counsel", CARL],
      ["Studio Head", CARL],
      ["VP of Everything", CARL],
    ],
  },
  {
    title: "Direction & Creative",
    credits: [
      ["Game Director", CARL],
      ["Creative Director", CARL],
      ["Technical Director", CARL],
      ["Art Director", CARL],
      ["Cinematic Director", CARL],
      ["Vision Holder", CARL],
      ["Chief Idea Officer", CARL],
      ["Final Say Enforcer", CARL],
      ["Scope Creep Approver", CARL],
      ['"It\'ll be fine" Guarantor', CARL],
    ],
  },
  {
    title: "Engine & Rendering",
    credits: [
      ["Lead Engine Programmer", CARL],
      ["Senior Engine Programmer", CARL],
      ["Engine Programmer", CARL],
      ["Junior Engine Programmer (Also Carl)", CARL],
      ["Three.js Integration Specialist", CARL],
      ["WebGL Wrangler", CARL],
      ["Render Pipeline Architect", CARL],
      ["Post-Processing Supervisor", CARL],
      ["Scene Post-Processing Engineer", CARL],
      ["Shader Artist", CARL],
      ["GPU Warmup Coordinator", CARL],
      ["Frame Budget Negotiator", CARL],
      ["Draw Call Reduction Enthusiast", CARL],
      ["Anti-Aliasing Consultant", CARL],
      ["Pixel Pusher Supreme", CARL],
    ],
  },
  {
    title: "Gameplay Systems",
    credits: [
      ["Lead Gameplay Programmer", CARL],
      ["Player Controller Engineer", CARL],
      ["Input Systems Architect", CARL],
      ["Key Bindings Memorization Coach", CARL],
      ["Collision Detection Specialist", CARL],
      ["Physics Consultant (Self-Taught)", CARL],
      ["Weapon Systems Programmer", CARL],
      ["View Weapon Artist-Programmer", CARL],
      ["Weapon Tuning Panel Operator", CARL],
      ["Grenade Trajectory Mathematician", CARL],
      ["Ammo Crate Logistics Engineer", CARL],
      ["Pickup Preview Specialist", CARL],
      ["Pickup Flash Layer Designer", CARL],
      ["Target Systems Engineer", CARL],
      ["Target Pose Consultant", CARL],
      ["Doorway Wall Technician", CARL],
      ['"Just one more feature" Engineer', CARL],
    ],
  },
  {
    title: "Level Design & World",
    credits: [
      ["Lead Level Designer", CARL],
      ["Arena Architect", CARL],
      ["Room Placement Strategist", CARL],
      ["Level Room Curator", CARL],
      ["Stair Ramp Designer", CARL],
      ["Stair Walk Physics Consultant", CARL],
      ["Pillar Geometry Curator", CARL],
      ["Room Culling Optimization Expert", CARL],
      ["Shadow Occluder Placement Artist", CARL],
      ["Level Texture Painter", CARL],
      ["Wall Box UV Specialist", CARL],
      ["Level Constants Maintainer", CARL],
      ["Procedural Placement Skeptic", CARL],
      ['"Is this room too big?" Analyst', CARL],
    ],
  },
  {
    title: "Lighting & Atmosphere",
    credits: [
      ["Lighting Director", CARL],
      ["Sun Light Tuning Engineer", CARL],
      ["Moon Light Calibration Specialist", CARL],
      ["Hemisphere Lighting Artist", CARL],
      ["Lighting Layers Coordinator", CARL],
      ["Candle Flicker Animator", CARL],
      ["Arena Ceiling Day/Night Coordinator", CARL],
      ["Scene Environment Designer", CARL],
      ["Sky Dome Artist", CARL],
      ["Mood Lighting Consultant", CARL],
      ["Shadow Quality Perfectionist", CARL],
      ['"Make it darker" Request Fulfiller', CARL],
    ],
  },
  {
    title: "Visual Effects & Combat Feedback",
    credits: [
      ["VFX Supervisor", CARL],
      ["Blood Particle Effects Artist", CARL],
      ["Bullet Hole Decal Specialist", CARL],
      ["Impact Feedback Designer", CARL],
      ["Screen Shake Authority", CARL],
      ["Juice Engineer", CARL],
      ["Particle Count Limit Breaker", CARL],
      ["Satisfying Hit Marker Consultant", CARL],
    ],
  },
  {
    title: "Character & Animation",
    credits: [
      ["Lead Animator", CARL],
      ["Walk Bob Tuning Specialist", CARL],
      ["Stair Walk Tune Panel Engineer", CARL],
      ["Head Bob Frequency Analyst", CARL],
      ["First-Person Presence Director", CARL],
      ["Motion Sickness Prevention Officer", CARL],
      ["Idle Animation (There Is None)", CARL],
    ],
  },
  {
    title: "Audio",
    credits: [
      ["Audio Director", CARL],
      ["Sound Designer", CARL],
      ["Lead Composer", CARL],
      ["Foley Artist", CARL],
      ["Gunshot Recording Engineer", CARL],
      ["Footstep Recording Engineer", CARL],
      ["Reload Sound Perfectionist", CARL],
      ["Audio Spectrum Visualization Engineer", CARL],
      ["Loading Audio Experience Curator", CARL],
      ["Volume Slider Guardian", CARL],
      ['"Turn it down" Compliance Officer', CARL],
    ],
  },
  {
    title: "User Interface & HUD",
    credits: [
      ["UI/UX Director", CARL],
      ["HUD Bar Designer", CARL],
      ["HUD Bar Tuning Engineer", CARL],
      ["Compass Overlay Artist", CARL],
      ["Controls Panel Architect", CARL],
      ["Settings Section Writer", CARL],
      ["Death Overlay Typographer", CARL],
      ["Loading Screen Art Director", CARL],
      ["FPS Counter Toggle Maintainer", CARL],
      ["Dev Panel Tab Organizer", CARL],
      ["Font Choice Overthinker", CARL],
      ["Orbitron Font Enthusiast", CARL],
    ],
  },
  {
    title: "Dev Tools & Tuning Panels",
    credits: [
      ["Dev Tools Czar", CARL],
      ["Weapon Tune Panel Engineer", CARL],
      ["Walk Bob Tune Panel Engineer", CARL],
      ["Stair Tune Panel Engineer", CARL],
      ["Sun Tune Panel Engineer", CARL],
      ["Hemisphere Tune Panel Engineer", CARL],
      ["Level Object Tune Panel Engineer", CARL],
      ["Target Pose Tune Panel Engineer", CARL],
      ["Sliders For Everything Advocate", CARL],
      ["Live Tweak Enjoyer", CARL],
    ],
  },
  {
    title: "Quality Assurance",
    credits: [
      ["QA Lead", CARL],
      ["Senior QA Tester", CARL],
      ["QA Tester", CARL],
      ["Playtest Coordinator", CARL],
      ["Bug Finder", CARL],
      ["Bug Fixer", CARL],
      ["Regression Testing (All Of It)", CARL],
      ['"Works On My Machine" Certifier', CARL],
      ["Edge Case Discoverer", CARL],
      ["Stuck In Geometry Investigator", CARL],
      ["Performance Profiler", CARL],
    ],
  },
  {
    title: "Technical Operations",
    credits: [
      ["Build Engineer", CARL],
      ["Dev Server Wrangler", CARL],
      ["Next.js Configuration Specialist", CARL],
      ["Hot Reload Survivor", CARL],
      ["Cache Cleaner", CARL],
      ["node_modules Whisperer", CARL],
      ["Git Commit Message Poet", CARL],
      ["Merge Conflict Resolver", CARL],
      ["Force Push Avoider (Mostly)", CARL],
    ],
  },
  {
    title: "Cast",
    credits: [
      ["The Player", CARL],
      ["Every Enemy Target", CARL],
      ["The Gun", CARL],
      ["The Grenade", CARL],
      ["The Ammo Crate", CARL],
      ["The Doorway", CARL],
      ["The Stairs", CARL],
      ["The Pillar (Scene Stealer)", CARL],
      ["The Candle (Flickering)", CARL],
      ["The Sky Dome", CARL],
    ],
  },
  {
    title: "Stunts & Practical Effects",
    credits: [
      ["Stunt Coordinator", CARL],
      ["Grenade Throw Double", CARL],
      ["Wall Clip Stunt Performer", CARL],
      ["Rocket Jump Consultant (Denied)", CARL],
      ["Blood Splatter Coordinator", CARL],
    ],
  },
  {
    title: "Catering & Wellness",
    credits: [
      ["Craft Services", CARL],
      ["Coffee Machine Operator", CARL],
      ["Energy Drink Procurement", CARL],
      ["Midnight Snack Coordinator", CARL],
      ["Sleep Deprivation Manager", CARL],
      ["Break Reminder (Ignored)", CARL],
    ],
  },
  {
    title: "Special Thanks",
    credits: [
      ["Three.js", "For existing"],
      ["React", "For re-rendering"],
      ["Next.js", "For the router (finally)"],
      ["WebGL", "For not crashing (usually)"],
      ["The Color #0a0a0c", "For vibe"],
      ["60 FPS", "When Carl allows it"],
      ["Stack Overflow", "Carl's co-pilot"],
      ["Carl Fearby's Keyboard", "Hero"],
      ["Carl Fearby's Monitor", "Long-suffering"],
      ["Dropbox", "For syncing at the worst times"],
      ["Future Carl", "Good luck"],
      ["Past Carl", "Sorry about the tech debt"],
    ],
  },
  {
    title: "Legal & Compliance",
    credits: [
      ["General Counsel", CARL],
      ["Intellectual Property Owner", CARL],
      ["Copyright Holder", CARL],
      ["Trademark Applicant", CARL],
      ["Terms of Service Author", CARL],
      ["Privacy Policy (Empty Page)", CARL],
      ["NDA Signatory (Self)", CARL],
    ],
  },
];

const ASSETS = {
  grenade: { src: "/ui/grenade.png" },
  powepack: { src: "/ui/powepack.png" },
  stamina: { src: "/ui/stamina-icon.png" },
  "second-weapon": { src: "/ui/second-weapon.png" },
  radar: { src: "/ui/radar_hud.png" },
  "crate-front": { src: "/ui/crate/front.png" },
  "crate-top": { src: "/ui/crate/top.png" },
  "crate-end": { src: "/ui/crate/endcap.png" },
  vx27: { src: "/textures/vx27/vx27_body_albedo.png" },
  "grenade-tex": { src: "/textures/grenade/grenade_reward_texture_pack_preview.png" },
  moon: { src: "/sky/moon_full.jpg" },
  hazard: { src: "/textures/decal_hazard_stripes_worn/decal_hazard_stripes_worn_albedo_tileable.png" },
  "bullet-1": { src: "/textures/bullet_holes/01_concrete_bullet_hole_alpha.png" },
  "bullet-2": { src: "/textures/bullet_holes/02_concrete_bullet_hole_alpha.png" },
  "bullet-3": { src: "/textures/bullet_holes/03_concrete_bullet_hole_alpha.png" },
  "bullet-4": { src: "/textures/bullet_holes/04_concrete_bullet_hole_alpha.png" },
  "bullet-5": { src: "/textures/bullet_holes/05_concrete_bullet_hole_alpha.png" },
};

/** Prop art sprinkled between credit sections — keyed by section title. */
const PROPS_AFTER = {
  Production: { layout: "scatter", items: ["grenade", "powepack", "stamina"] },
  "Direction & Creative": { layout: "solo", item: "radar", caption: "Tactical Overlay" },
  "Engine & Rendering": { layout: "rifle", caption: "VX-27 Rifle" },
  "Gameplay Systems": { layout: "ammo-crate" },
  "Level Design & World": { layout: "solo", item: "second-weapon", caption: "Standard Issue" },
  "Lighting & Atmosphere": { layout: "moon" },
  "Visual Effects & Combat Feedback": { layout: "bullet-wall" },
  "Character & Animation": { layout: "solo", item: "stamina", caption: "Walk Power", spin: true },
  Audio: { layout: "duo", items: ["powepack", "grenade"], caption: "Soundtrack Fuel" },
  "User Interface & HUD": { layout: "hud-row", items: ["second-weapon", "radar", "stamina"] },
  "Dev Tools & Tuning Panels": { layout: "hazard" },
  "Quality Assurance": { layout: "scatter", items: ["crate-front", "grenade", "bullet-1"] },
  "Technical Operations": { layout: "solo", item: "radar", caption: "Systems Online" },
  Cast: { layout: "cluster" },
  "Stunts & Practical Effects": { layout: "duo", items: ["grenade", "powepack"] },
  "Catering & Wellness": { layout: "solo", item: "powepack", caption: "Craft Services" },
  "Special Thanks": { layout: "scatter", items: ["crate-front", "grenade", "powepack", "stamina"] },
  "Legal & Compliance": { layout: "texture-strip", art: "grenade-tex", caption: "Exhibit A" },
};

const SECTION_LAYOUTS = {
  Production: { align: "center", cols: 1 },
  "Direction & Creative": { align: "center", cols: 1, flank: "rifle", flankSide: "left" },
  "Engine & Rendering": { align: "center", cols: 1, flank: "bullet-cluster", flankSide: "right" },
  "Gameplay Systems": { align: "center", cols: 1 },
  "Level Design & World": { align: "center", cols: 1, flank: "hazard", flankSide: "left" },
  "Lighting & Atmosphere": { align: "center", cols: 1, flank: "moon", flankSide: "right" },
  "Visual Effects & Combat Feedback": { align: "center", cols: 1 },
  "Character & Animation": { align: "center", cols: 1 },
  Audio: { align: "center", cols: 1 },
  "User Interface & HUD": { align: "center", cols: 1 },
  "Dev Tools & Tuning Panels": { align: "center", cols: 1, flank: "grenade-tex", flankSide: "left" },
  "Quality Assurance": { align: "center", cols: 1 },
  "Technical Operations": { align: "center", cols: 1 },
  Cast: { align: "center", cols: 1 },
  "Stunts & Practical Effects": { align: "center", cols: 1, flank: "bullet-cluster", flankSide: "right" },
  "Catering & Wellness": { align: "center", cols: 1 },
  "Special Thanks": { align: "center", cols: 1 },
  "Legal & Compliance": { align: "center", cols: 1 },
};

const INTERSTITIAL_CYCLE = [
  "drift-grenade-r",
  "drift-crate-l",
  "art-moon",
  "art-hazard",
  "drift-stamina-l",
  "art-vx27",
  "drift-powepack-r",
  "art-grenade-tex",
  "drift-radar",
  "art-bullet-wall",
];

function SectionRule({ align = "center" }) {
  return (
    <div className={`creditsSectionRule creditsSectionRule--${align}`} aria-hidden>
      <span className="creditsSectionRuleLine" />
      <span className="creditsSectionRuleDot" />
      <span className="creditsSectionRuleLine" />
    </div>
  );
}

function CreditBlock({ role, name, highlight }) {
  return (
    <div className={`creditsBlock${highlight ? " creditsBlock--highlight" : ""}`}>
      <div className="creditsRole">{role}</div>
      <div className={`creditsName${highlight ? " gold" : ""}`}>{name}</div>
    </div>
  );
}

function CreditsAsset({ id, className = "" }) {
  const asset = ASSETS[id];
  if (!asset) return null;
  return (
    <img
      src={asset.src}
      alt=""
      className={`creditsPropImg creditsAsset creditsAsset--${id}${className ? ` ${className}` : ""}`}
      draggable={false}
    />
  );
}

function CreditsFlankArt({ art, side }) {
  if (!art) return null;
  if (art === "rifle") {
    return (
      <div className={`creditsFlank creditsFlank--${side}`} aria-hidden>
        <CreditsRiflePreview variant="flank" />
      </div>
    );
  }
  return (
    <div className={`creditsFlank creditsFlank--${side}`} aria-hidden>
      {art === "bullet-cluster" ? (
        <div className="creditsFlankBulletCluster">
          <CreditsAsset id="bullet-1" className="creditsFlankBullet creditsFlankBullet--a" />
          <CreditsAsset id="bullet-3" className="creditsFlankBullet creditsFlankBullet--b" />
          <CreditsAsset id="bullet-5" className="creditsFlankBullet creditsFlankBullet--c" />
        </div>
      ) : (
        <CreditsAsset id={art} className="creditsFlankImg" />
      )}
    </div>
  );
}

function CreditsInterstitial({ kind }) {
  if (!kind) return null;

  if (kind.startsWith("drift-")) {
    const parts = kind.split("-");
    const side = parts.length > 2 ? parts[parts.length - 1] : "l";
    const asset = parts.length > 2 ? parts.slice(1, -1).join("-") : parts[1];
    const id = asset === "crate" ? "crate-front" : asset;
    return (
      <div className={`creditsDrift creditsDrift--${side}`} aria-hidden>
        <CreditsAsset id={id} />
      </div>
    );
  }

  if (kind === "art-moon") {
    return (
      <div className="creditsInterstitial creditsInterstitial--moon" aria-hidden>
        <CreditsAsset id="moon" className="creditsMoonDisc" />
      </div>
    );
  }

  if (kind === "art-hazard") {
    return (
      <div className="creditsInterstitial creditsInterstitial--hazard" aria-hidden>
        <CreditsAsset id="hazard" className="creditsHazardStrip" />
      </div>
    );
  }

  if (kind === "art-vx27") {
    return (
      <div className="creditsInterstitial creditsInterstitial--vx27" aria-hidden>
        <CreditsRiflePreview variant="hero" />
        <p className="creditsPropCaption">VX-27 Rifle</p>
      </div>
    );
  }

  if (kind === "art-grenade-tex") {
    return (
      <div className="creditsInterstitial creditsInterstitial--grenadeTex" aria-hidden>
        <CreditsAsset id="grenade-tex" className="creditsGrenadeStrip" />
      </div>
    );
  }

  if (kind === "art-bullet-wall") {
    return (
      <div className="creditsInterstitial creditsInterstitial--bulletWall" aria-hidden>
        <CreditsAsset id="bullet-1" className="creditsBulletWallItem creditsBulletWallItem--0" />
        <CreditsAsset id="bullet-2" className="creditsBulletWallItem creditsBulletWallItem--1" />
        <CreditsAsset id="bullet-4" className="creditsBulletWallItem creditsBulletWallItem--2" />
        <CreditsAsset id="bullet-5" className="creditsBulletWallItem creditsBulletWallItem--3" />
      </div>
    );
  }

  return null;
}

function CreditsDrift({ kind }) {
  return <CreditsInterstitial kind={kind} />;
}

function CreditSection({ title, credits }) {
  const layout = SECTION_LAYOUTS[title] ?? { align: "center", cols: 1 };
  const { align, cols, flank, flankSide } = layout;

  return (
    <div className="creditsSectionWrap">
      {flank ? <CreditsFlankArt art={flank} side={flankSide ?? "left"} /> : null}
      <section className={`creditsSection creditsSection--${align} creditsSection--cols${cols}`}>
        <h2 className="creditsSectionTitle">{title}</h2>
        <SectionRule align={align} />
        <div className="creditsSectionBody">
          {credits.map(([role, name], i) => (
            <CreditBlock key={`${title}-${i}`} role={role} name={name} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SongsSection() {
  return (
    <div className="creditsSectionWrap">
      <CreditsFlankArt art="moon" side="right" />
      <section className="creditsSection creditsSection--center creditsSection--cols1">
        <h2 className="creditsSectionTitle">Songs</h2>
        <SectionRule align="center" />
        {MUSIC_TRACKS.map((track, index) => (
          <div key={track.id} className="creditsSong">
            <svg
              className="creditsSongIcon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M9 18V5l12-2v13"
                stroke="#5eaaff"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="6" cy="18" r="3" fill="rgba(94,170,255,0.35)" stroke="#5eaaff" strokeWidth="1.5" />
              <circle cx="18" cy="16" r="3" fill="rgba(94,170,255,0.35)" stroke="#5eaaff" strokeWidth="1.5" />
            </svg>
            <h3 className="creditsSongTitle">{track.label}</h3>
            <p className="creditsSongUsage">{trackUsageLabel(track.id)}</p>
            {SONG_CREDITS.map(([role, name]) => (
              <CreditBlock key={`${track.id}-${role}`} role={role} name={name} />
            ))}
            {index < MUSIC_TRACKS.length - 1 ? (
              <div className="creditsSongDivider" aria-hidden />
            ) : null}
          </div>
        ))}
      </section>
    </div>
  );
}

function CreditsDecor() {
  return (
    <>
      <div className="creditsGrid" aria-hidden />
      <div className="creditsScanline" aria-hidden />
      <div className="creditsSweep" aria-hidden />
      <div className="creditsRadarWatermark" aria-hidden />
      <div className="creditsRadarWatermark creditsRadarWatermarkRight" aria-hidden />
      <div className="creditsHudWatermark" aria-hidden />
      <div className="creditsCornerBrackets" aria-hidden />
    </>
  );
}

function CreditsPropImg({ id, className = "" }) {
  return <CreditsAsset id={id} className={className} />;
}

function CreditsAmmoCrate() {
  return (
    <div className="creditsAmmoCrate" aria-hidden>
      <CreditsPropImg id="crate-end" className="creditsCrateEnd" />
      <CreditsPropImg id="crate-top" className="creditsCrateTop" />
      <CreditsPropImg id="crate-front" className="creditsCrateFront" />
    </div>
  );
}

function CreditsPropInsert({ layout, items, item, caption, spin, art }) {
  return (
    <div className="creditsPropInsert" aria-hidden>
      {caption ? <p className="creditsPropCaption">{caption}</p> : null}

      {layout === "moon" ? (
        <div className="creditsInterstitial creditsInterstitial--moon creditsInterstitial--inline">
          <CreditsAsset id="moon" className="creditsMoonDisc" />
          <p className="creditsPropCaption">Lunar Calibration Reference</p>
        </div>
      ) : null}

      {layout === "hazard" ? (
        <div className="creditsInterstitial creditsInterstitial--hazard creditsInterstitial--inline">
          <CreditsAsset id="hazard" className="creditsHazardStrip" />
        </div>
      ) : null}

      {layout === "bullet-wall" ? (
        <CreditsInterstitial kind="art-bullet-wall" />
      ) : null}

      {layout === "texture-strip" ? (
        <div className="creditsInterstitial creditsInterstitial--texture creditsInterstitial--inline">
          {art === "vx27" || art === "rifle" ? (
            <CreditsRiflePreview variant="strip" />
          ) : (
            <CreditsAsset id={art} className="creditsTextureStrip" />
          )}
        </div>
      ) : null}

      {layout === "rifle" ? (
        <div className="creditsInterstitial creditsInterstitial--vx27 creditsInterstitial--inline">
          <CreditsRiflePreview variant="hero" />
          {caption ? <p className="creditsPropCaption">{caption}</p> : null}
        </div>
      ) : null}

      {layout === "ammo-crate" ? (
        <>
          <CreditsAmmoCrate />
          <p className="creditsPropCaption">Ammo Resupply Unit</p>
        </>
      ) : null}

      {layout === "solo" ? (
        <div className={`creditsPropSolo${spin ? " creditsPropSolo--spin" : ""}`}>
          <CreditsPropImg id={item} />
        </div>
      ) : null}

      {layout === "duo" ? (
        <div className="creditsPropDuo">
          {items?.map((id, i) => (
            <CreditsPropImg key={id} id={id} className={i === 0 ? "creditsPropDuoLeft" : "creditsPropDuoRight"} />
          ))}
        </div>
      ) : null}

      {layout === "hud-row" ? (
        <div className="creditsPropHudRow">
          {items?.map((id) => (
            <div key={id} className={`creditsPropHudCell creditsPropHudCell--${id}`}>
              <CreditsPropImg id={id} />
            </div>
          ))}
        </div>
      ) : null}

      {layout === "scatter" ? (
        <div className="creditsPropScatter">
          {items?.map((id, i) => (
            <CreditsPropImg
              key={`${id}-${i}`}
              id={id}
              className={`creditsPropScatterItem creditsPropScatterItem--${i}`}
            />
          ))}
        </div>
      ) : null}

      {layout === "cluster" ? (
        <div className="creditsPropCluster">
          <CreditsAmmoCrate />
          <CreditsPropImg id="grenade" className="creditsPropClusterGrenade" />
          <CreditsPropImg id="powepack" className="creditsPropClusterPowepack" />
          <CreditsPropImg id="stamina" className="creditsPropClusterStamina" />
          <div className="creditsPropClusterHud">
            <CreditsPropImg id="second-weapon" />
          </div>
        </div>
      ) : null}

      {layout === "finale-row" ? (
        <>
          <p className="creditsPropCaption">The Whole Arsenal</p>
          <div className="creditsPropFinaleRow">
            <CreditsPropImg id="grenade" className="creditsPropFinaleItem creditsPropFinaleItem--0" />
            <CreditsPropImg id="crate-front" className="creditsPropFinaleItem creditsPropFinaleItem--1" />
            <CreditsPropImg id="powepack" className="creditsPropFinaleItem creditsPropFinaleItem--2" />
            <CreditsPropImg id="stamina" className="creditsPropFinaleItem creditsPropFinaleItem--3" />
            <CreditsPropImg id="second-weapon" className="creditsPropFinaleItem creditsPropFinaleItem--4" />
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function CreditsScene() {
  const scrollRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [fast, setFast] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = () => {
      const viewport = el.parentElement?.offsetHeight ?? window.innerHeight;
      const distance = el.offsetHeight + viewport;
      const duration = distance / SCROLL_SPEED;
      el.style.setProperty("--credits-duration", `${duration}s`);
      el.style.setProperty("--credits-delay", `${INTRO_DELAY_S}s`);
      setReady(true);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setHintVisible(false), 9000);
    return () => clearTimeout(timer);
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
    setHintVisible(false);
  }, []);

  const toggleFast = useCallback((e) => {
    e.stopPropagation();
    setFast((f) => !f);
    setHintVisible(false);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        togglePause();
      }
      if (e.code === "KeyF") toggleFast({ stopPropagation: () => {} });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, toggleFast]);

  return (
    <div className="creditsRoot" onClick={togglePause}>
      <CreditsDecor />
      <div className="creditsGrain" aria-hidden />
      <div className="creditsIntroCurtain" aria-hidden />
      <div className="creditsVignette" aria-hidden />

      <Link href="/" className="creditsBack" onClick={(e) => e.stopPropagation()}>
        ← Back to Game
      </Link>

      <div className={`creditsHint${hintVisible ? "" : " hidden"}`}>
        Click or Space to pause · F to speed up
      </div>

      <div className="creditsViewport">
        <div className="creditsEmergenceGlow" aria-hidden />
        <div className="creditsFadeTop" aria-hidden />
        <div className="creditsFadeBottom" aria-hidden />

        <div
          ref={scrollRef}
          className={`creditsScroll${paused ? " paused" : ""}${fast ? " fast" : ""}${ready ? " creditsScrollReady" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="creditsSpacerLg" />

          <div className="creditsHero">
            <p className="creditsStudio">Carl Fearby Productions Presents</p>
            <img src="/ui/logo.png" alt="VX-27" className="creditsLogo" />
            <p className="creditsSubtitle">A First-Person Masterpiece</p>
            <div className="creditsDivider" aria-hidden>
              <span className="creditsDividerLine" />
              <span className="creditsDividerDiamond" />
              <span className="creditsDividerLine" />
            </div>
          </div>

          <div className="creditsSpacerLg" />

          <div className="creditsOpener">
            <CreditBlock role="Written & Directed by" name={CARL} highlight />
            <CreditBlock role="Based on an original idea by" name={CARL} />
            <CreditBlock role="Inspired by the dreams of" name={CARL} />
          </div>

          <CreditsInterstitial kind="art-vx27" />

          <div className="creditsSpacerLg" />

          {SECTIONS.map((section, sectionIndex) => (
            <Fragment key={section.title}>
              <CreditsInterstitial kind={INTERSTITIAL_CYCLE[sectionIndex % INTERSTITIAL_CYCLE.length]} />
              <CreditSection {...section} />
              {section.title === "Audio" ? <SongsSection /> : null}
              {PROPS_AFTER[section.title] ? (
                <CreditsPropInsert {...PROPS_AFTER[section.title]} />
              ) : null}
            </Fragment>
          ))}

          <CreditsPropInsert layout="finale-row" />

          <p className="creditsQuote">
            &ldquo;I did literally everything.&rdquo;
            <br />
            — Carl Fearby, probably
          </p>

          <div className="creditsFinale">
            <p className="creditsFinaleLead">
              Written · Directed · Produced · Programmed · Designed · Composed ·
              <br />
              Tested · Deployed · Credited · And Blamed For Everything By
            </p>
            <p className="creditsFinaleName">{CARL}</p>
          </div>

          <p className="creditsLegal">
            VX-27 © {new Date().getFullYear()} Carl Fearby. All rights reserved.
            All wrongs reserved. All middling-rights reserved by Carl Fearby acting in
            his capacity as Carl Fearby. Unauthorized duplication, distribution, or
            existence of this game may result in Carl Fearby noticing.
          </p>

          <div className="creditsSpacerLg" />

          <CreditsBigBangFinale />

          <div className="creditsSpacerLg" />
          <div className="creditsSpacerLg" />
        </div>
      </div>
    </div>
  );
}

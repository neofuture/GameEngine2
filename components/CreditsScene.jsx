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

/** The entire studio staff — every name an anagram of Carl Fearby. */
const STAFF = Object.freeze([
  "Barry Calfe",
  "Carly Faber",
  "Clay Farber",
  "Alec Frybar",
  "Clare Barfy",
  "Ray Barclef",
  "Faryl Brace",
  "Ralf Bracey",
  "Farley Crab",
  "Arby Calfer",
]);

/** Pick three crew for a section (offset rotates who leads each department). */
function trio(offset = 0) {
  return [0, 1, 2].map((i) => STAFF[(offset + i) % STAFF.length]);
}

const SCROLL_SPEED = 95;
const INTRO_DELAY_S = 2;

/** Per-track soundtrack credits — tongue firmly in cheek. */
const TRACK_SONG_CREDITS = Object.freeze({
  "galactic-drifter": [
    ["Official Mood", "Staring At A Progress Bar"],
    ["Written during", "npm install (still running)"],
    ["Tempo", "Slower Than Your Download"],
    ["Key", "Waiting Minor"],
    ["Time Signature", "4/4 Until The Bar Stops"],
    ["Inspired by", "The spinning VX-27 logo"],
    ["Lyrics", "None (Carl was busy loading)"],
    ["Composed by", "Faryl Brace"],
    ["Arranged by", "Barry Calfe"],
    ["Programmed by", "Carly Faber"],
    ["Mixed by", "Clay Farber"],
    ["Mastered by", "Alec Frybar"],
    ["Mixer Notes", "More reverb than progress"],
    ["Plays When", "Carl tests 'one more thing'"],
    ["Grammy Category", "Best Loading Screen Anthem"],
    ["Streaming Revenue", "Paid in exposure"],
    ["Vocals", "Carl Fearby (mumbling 'almost there')"],
    ["Executive Producer", CARL],
    ["Published by", `${CARL} Productions`],
    ["Rights", "All rites reserved for the loading cult"],
  ],
  "galactic-drifter-2": [
    ["Subtitle", "The Driftening Continues"],
    ["Sequel Because", "Carl had one more MIDI file"],
    ["Features", "47% More Galactic, 12% More Drift"],
    ["Written by", "Ray Barclef"],
    ["Produced by", "Farley Crab"],
    ["Composed while", "Carl walked into pillars repeatedly"],
    ["Combat Mix", "Duck under gunfire (unimplemented)"],
    ["Loop Length", "Long enough to forget which room"],
    ["BPM", "Exactly one sprint per bar"],
    ["Player Feedback", "'Can we skip this?' — Carl, playtesting"],
    ["Licensed for", "Indoor arena violence only"],
    ["Not Licensed for", "Actual galactic drifting"],
    ["Co-Produced by", "Arby Calfer"],
    ["Performed by", "The Carl Fearby Anagram Players"],
    ["All Instruments", "A laptop and hope"],
    ["Soundcheck", "Passed (Carl was the only listener)"],
    ["Vocals", "Carl Fearby (uncredited, again)"],
    ["Executive Music Producer", CARL],
    ["Published by", `${CARL} Productions`],
    ["In Memoriam", "Your ears, briefly"],
  ],
});

function trackUsageLabel(trackId) {
  if (trackId === DEFAULT_LOADING_TRACK_ID) return "Loading Screen Theme";
  if (trackId === DEFAULT_LEVEL_TRACK_ID) return "In-Game Theme";
  return "Original Soundtrack";
}

function trackTagline(trackId) {
  if (trackId === DEFAULT_LOADING_TRACK_ID) {
    return "The anthem of patience. Side effects may include checking the router.";
  }
  if (trackId === DEFAULT_LEVEL_TRACK_ID) {
    return "Now with 100% more gameplay. Carl insists you will feel the drift.";
  }
  return "A Carl Fearby joint. No refunds on vibes.";
}

const SECTIONS = [
  {
    title: "Production",
    credits: [
      ["Executive Producer", trio(0)[0]],
      ["Producer", trio(0)[1]],
      ["Line Producer", trio(0)[2]],
      ["Unit Production Manager", "Barry Calfe"],
      ["Production Coordinator", "Carly Faber"],
      ["Production Accountant", "Clay Farber"],
      ["Studio Head", CARL],
    ],
  },
  {
    title: "Direction & Creative",
    credits: [
      ["Game Director", "Alec Frybar"],
      ["Creative Director", "Clare Barfy"],
      ["Art Director", "Ray Barclef"],
      ["Technical Director", "Faryl Brace"],
      ["Cinematic Director", "Ralf Bracey"],
      ["Vision Holder", "Farley Crab"],
      ["Final Say Enforcer", CARL],
    ],
  },
  {
    title: "Engine & Rendering",
    credits: [
      ["Lead Engine Programmer", "Arby Calfer"],
      ["Render Pipeline Architect", "Barry Calfe"],
      ["WebGL Wrangler", "Carly Faber"],
      ["Shader Artist", "Clay Farber"],
      ["Post-Processing Supervisor", "Alec Frybar"],
      ["GPU Warmup Coordinator", "Clare Barfy"],
      ["Frame Budget Negotiator", "Ray Barclef"],
    ],
  },
  {
    title: "Gameplay Systems",
    credits: [
      ["Lead Gameplay Programmer", "Faryl Brace"],
      ["Player Controller Engineer", "Ralf Bracey"],
      ["Collision Detection Specialist", "Farley Crab"],
      ["Weapon Systems Programmer", "Arby Calfer"],
      ["Grenade Trajectory Mathematician", "Barry Calfe"],
      ["Target Systems Engineer", "Carly Faber"],
      ["Doorway Wall Technician", "Clay Farber"],
    ],
  },
  {
    title: "Level Design & World",
    credits: [
      ["Lead Level Designer", "Alec Frybar"],
      ["Arena Architect", "Clare Barfy"],
      ["Stair Ramp Designer", "Ray Barclef"],
      ["Pillar Geometry Curator", "Faryl Brace"],
      ["Room Culling Optimization Expert", "Ralf Bracey"],
      ["Level Texture Painter", "Farley Crab"],
      ['"Is this room too big?" Analyst', "Arby Calfer"],
    ],
  },
  {
    title: "Lighting & Atmosphere",
    credits: [
      ["Lighting Director", "Barry Calfe"],
      ["Sun Light Tuning Engineer", "Carly Faber"],
      ["Moon Light Calibration Specialist", "Clay Farber"],
      ["Hemisphere Lighting Artist", "Alec Frybar"],
      ["Candle Flicker Animator", "Clare Barfy"],
      ["Shadow Quality Perfectionist", "Ray Barclef"],
    ],
  },
  {
    title: "Visual Effects & Combat Feedback",
    credits: [
      ["VFX Supervisor", "Faryl Brace"],
      ["Blood Particle Effects Artist", "Ralf Bracey"],
      ["Bullet Hole Decal Specialist", "Farley Crab"],
      ["Screen Shake Authority", "Arby Calfer"],
      ["Juice Engineer", "Barry Calfe"],
      ["Satisfying Hit Marker Consultant", "Carly Faber"],
    ],
  },
  {
    title: "Character & Animation",
    credits: [
      ["Lead Animator", "Clay Farber"],
      ["Walk Bob Tuning Specialist", "Alec Frybar"],
      ["Stair Walk Physics Consultant", "Clare Barfy"],
      ["Head Bob Frequency Analyst", "Ray Barclef"],
      ["Motion Sickness Prevention Officer", "Faryl Brace"],
      ["First-Person Presence Director", "Ralf Bracey"],
    ],
  },
  {
    title: "Audio",
    credits: [
      ["Audio Director", "Farley Crab"],
      ["Sound Designer", "Arby Calfer"],
      ["Lead Composer", "Barry Calfe"],
      ["Foley Artist", "Carly Faber"],
      ["Gunshot Recording Engineer", "Clay Farber"],
      ["Volume Slider Guardian", "Alec Frybar"],
    ],
  },
  {
    title: "User Interface & HUD",
    credits: [
      ["UI/UX Director", "Clare Barfy"],
      ["HUD Bar Designer", "Ray Barclef"],
      ["Compass Overlay Artist", "Faryl Brace"],
      ["Controls Panel Architect", "Ralf Bracey"],
      ["Loading Screen Art Director", "Farley Crab"],
      ["Orbitron Font Enthusiast", "Arby Calfer"],
    ],
  },
  {
    title: "Dev Tools & Tuning Panels",
    credits: [
      ["Dev Tools Czar", "Barry Calfe"],
      ["Weapon Tune Panel Engineer", "Carly Faber"],
      ["Stair Tune Panel Engineer", "Clay Farber"],
      ["Sun Tune Panel Engineer", "Alec Frybar"],
      ["Sliders For Everything Advocate", "Clare Barfy"],
      ["Live Tweak Enjoyer", "Ray Barclef"],
    ],
  },
  {
    title: "Quality Assurance",
    credits: [
      ["QA Lead", "Faryl Brace"],
      ["Senior QA Tester", "Ralf Bracey"],
      ["Playtest Coordinator", "Farley Crab"],
      ["Bug Finder", "Arby Calfer"],
      ["Stuck In Geometry Investigator", "Barry Calfe"],
      ['"Works On My Machine" Certifier', "Carly Faber"],
    ],
  },
  {
    title: "Technical Operations",
    credits: [
      ["Build Engineer", "Clay Farber"],
      ["Next.js Configuration Specialist", "Alec Frybar"],
      ["Hot Reload Survivor", "Clare Barfy"],
      ["Git Commit Message Poet", "Ray Barclef"],
      ["Merge Conflict Resolver", "Faryl Brace"],
      ["Force Push Avoider (Mostly)", "Ralf Bracey"],
    ],
  },
  {
    title: "Cast",
    credits: [
      ["The Player", "Farley Crab"],
      ["Every Enemy Target", "Arby Calfer"],
      ["The Gun", "Barry Calfe"],
      ["The Grenade", "Carly Faber"],
      ["The Stairs", "Clay Farber"],
      ["The Pillar (Scene Stealer)", "Alec Frybar"],
      ["Carl Fearby", "As Himself"],
    ],
  },
  {
    title: "Stunts & Practical Effects",
    credits: [
      ["Stunt Coordinator", "Clare Barfy"],
      ["Grenade Throw Double", "Ray Barclef"],
      ["Wall Clip Stunt Performer", "Faryl Brace"],
      ["Blood Splatter Coordinator", "Ralf Bracey"],
    ],
  },
  {
    title: "Catering & Wellness",
    credits: [
      ["Craft Services", "Farley Crab"],
      ["Coffee Machine Operator", "Arby Calfer"],
      ["Energy Drink Procurement", "Barry Calfe"],
      ["Midnight Snack Coordinator", "Carly Faber"],
      ["Sleep Deprivation Manager", "Clay Farber"],
    ],
  },
  {
    title: "Special Thanks",
    credits: [
      ["Three.js", "For existing"],
      ["React", "For re-rendering"],
      ["Next.js", "For the router (finally)"],
      ["WebGL", "For not crashing (usually)"],
      ["The Anagram Department", "For plausible deniability"],
      ["60 FPS", "When Carl allows it"],
      ["Stack Overflow", "Carl's co-pilot"],
      ["Future Carl", "Good luck"],
      ["Past Carl", "Sorry about the tech debt"],
    ],
  },
  {
    title: "Legal & Compliance",
    credits: [
      ["General Counsel", "Alec Frybar"],
      ["Intellectual Property Owner", "Clare Barfy"],
      ["Copyright Holder", "Ray Barclef"],
      ["Trademark Applicant", "Faryl Brace"],
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

function StaffRosterSection() {
  return (
    <section className="creditsSection creditsSection--center creditsStaffRoster">
      <h2 className="creditsSectionTitle">Studio Staff</h2>
      <SectionRule align="center" />
      <p className="creditsStaffRosterLead">
        The following personnel contributed to this production.
        <br />
        Any resemblance to real developers is purely alphabetical.
      </p>
      <div className="creditsStaffRosterGrid">
        {STAFF.map((name) => (
          <div key={name} className="creditsStaffRosterName">
            {name}
          </div>
        ))}
      </div>
      <p className="creditsStaffRosterFine">…and literally nobody else.</p>
    </section>
  );
}

function AnagramReveal() {
  return (
    <div className="creditsReveal" aria-label="Credits twist reveal">
      <p className="creditsRevealEyebrow">A Carl Fearby Production · Final Footnote</p>
      <h2 className="creditsRevealTitle">IT&apos;S ALL CARL</h2>
      <p className="creditsRevealSubtitle">THESE WERE ALL ANAGRAMS</p>
      <div className="creditsRevealDivider" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <p className="creditsRevealBody">
        Barry Calfe · Carly Faber · Clay Farber · Alec Frybar · Clare Barfy
        <br />
        Ray Barclef · Faryl Brace · Ralf Bracey · Farley Crab · Arby Calfer
      </p>
      <p className="creditsRevealSpell">
        Unscramble the staff. It&apos;s always been{" "}
        <span className="creditsRevealCarl">{CARL}</span>.
      </p>
      <p className="creditsRevealTag">No additional crew were harmed in the making of this credit roll.</p>
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

function CreditsEqualizer({ bars = 12 }) {
  return (
    <div className="creditsEq" aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="creditsEqBar" style={{ "--eq-i": i }} />
      ))}
    </div>
  );
}

function SongsSection() {
  return (
    <div className="creditsSectionWrap creditsSectionWrap--songs">
      <CreditsFlankArt art="moon" side="right" />
      <div className="creditsSongsAura" aria-hidden />
      <section className="creditsSection creditsSection--center creditsSection--songs">
        <h2 className="creditsSectionTitle creditsSectionTitle--glitch" data-text="Songs">
          Songs
        </h2>
        <SectionRule align="center" />
        <p className="creditsSongsLead">
          Original compositions. Any resemblance to professional music is coincidental and
          legally inconvenient.
        </p>
        {MUSIC_TRACKS.map((track, index) => {
          const credits = TRACK_SONG_CREDITS[track.id] ?? TRACK_SONG_CREDITS[DEFAULT_LOADING_TRACK_ID];
          return (
            <div
              key={track.id}
              className={`creditsSong creditsSong--${index % 2 === 0 ? "a" : "b"}`}
            >
              <CreditsEqualizer />
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
              <p className="creditsSongTagline">{trackTagline(track.id)}</p>
              <div className="creditsSongCredits">
                {credits.map(([role, name]) => (
                  <CreditBlock key={`${track.id}-${role}`} role={role} name={name} />
                ))}
              </div>
              {index < MUSIC_TRACKS.length - 1 ? (
                <div className="creditsSongDivider" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function CreditsDecor() {
  return (
    <>
      <div className="creditsGrid" aria-hidden />
      <div className="creditsAurora" aria-hidden />
      <div className="creditsScanline" aria-hidden />
      <div className="creditsSweep" aria-hidden />
      <div className="creditsSweep creditsSweep--reverse" aria-hidden />
      <div className="creditsRadarWatermark" aria-hidden />
      <div className="creditsRadarWatermark creditsRadarWatermarkRight" aria-hidden />
      <div className="creditsHudWatermark" aria-hidden />
      <div className="creditsCornerBrackets" aria-hidden />
      <div className="creditsParticles" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} className="creditsParticle" style={{ "--p-i": i }} />
        ))}
      </div>
      <div className="creditsChromatic" aria-hidden />
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
            <p className="creditsSubtitle creditsSubtitle--shimmer">A First-Person Masterpiece</p>
            <div className="creditsDivider" aria-hidden>
              <span className="creditsDividerLine" />
              <span className="creditsDividerDiamond" />
              <span className="creditsDividerLine" />
            </div>
          </div>

          <div className="creditsSpacerLg" />

          <div className="creditsOpener">
            <CreditBlock role="Written & Directed by" name={CARL} highlight />
            <CreditBlock role="Based on an original idea by" name="Barry Calfe" />
            <CreditBlock role="Inspired by the dreams of" name="Carly Faber" />
          </div>

          <CreditsInterstitial kind="art-vx27" />

          <div className="creditsSpacerLg" />

          <StaffRosterSection />

          <div className="creditsSpacer" />

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
            &ldquo;We couldn&apos;t have done it without the team.&rdquo;
            <br />
            — Carl Fearby, after crediting himself ten times under different names
          </p>

          <div className="creditsFinale">
            <p className="creditsFinaleLead">
              In association with Barry Calfe · Carly Faber · Clay Farber · Alec Frybar ·
              Clare Barfy · Ray Barclef · Faryl Brace · Ralf Bracey · Farley Crab · Arby Calfer
            </p>
            <p className="creditsFinaleLead creditsFinaleLead--tight">
              Written · Directed · Produced · Programmed · Designed · Composed ·
              <br />
              Tested · Deployed · Credited · And Blamed For Everything By
            </p>
            <p className="creditsFinaleName">{CARL}</p>
          </div>

          <AnagramReveal />

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

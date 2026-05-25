import { Orbitron } from "next/font/google";
import "./globals.css";

// Futuristic display font used for in-game UI accents like the death overlay.
// Exposed as a CSS variable so globals.css can opt into it per-element.
const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  variable: "--font-futuristic",
  display: "swap",
});

export const metadata = {
  title: "FPS — GameEngine2",
  description: "First-person shooter prototype with Three.js",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={orbitron.variable}>
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "FPS — GameEngine2",
  description: "First-person shooter prototype with Three.js",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

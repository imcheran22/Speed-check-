import './globals.css';

export const metadata = {
  title: 'Speed Check - WiFi Speed Tracker',
  description: 'Track your internet speed over time',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

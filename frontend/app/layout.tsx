import type { Metadata } from "next";
import "./globals.css";

import { AppLayout } from "@/components/app-layout";

export const metadata: Metadata = {
  title: "SHAI — Smart Hospital AI Operations Platform",
  description:
    "Autonomous clinic capacity and patient engagement orchestrator: no-show prediction, prescriptive overbooking, trilingual outreach, and executive ROI simulation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary">
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}

import type { Metadata } from "next";

import { ChannelPage, type ChannelPageProps } from "@/app/_shared/channel-page";

export const metadata: Metadata = { title: "Google Ads" };

export default function Page({ searchParams }: ChannelPageProps) {
  return <ChannelPage channel="google-ads" searchParams={searchParams} />;
}

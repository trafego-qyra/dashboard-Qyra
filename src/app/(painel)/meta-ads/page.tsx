import type { Metadata } from "next";

import { ChannelPage, type ChannelPageProps } from "@/app/_shared/channel-page";

export const metadata: Metadata = { title: "Meta Ads" };

export default function Page({ searchParams }: ChannelPageProps) {
  return <ChannelPage channel="meta-ads" searchParams={searchParams} />;
}

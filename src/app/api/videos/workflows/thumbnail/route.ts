import { db } from "@/db";
import { videos } from "@/db/schema";
import { serve } from "@upstash/workflow/nextjs";
import { and, eq } from "drizzle-orm";
import { File } from "node:buffer";
import OpenAI from "openai";
import { UTApi } from "uploadthing/server";

interface InputType {
  userId: string;
  videoId: string;
  prompt: string;
}

export const { POST } = serve(async (context) => {
  const utapi = new UTApi();
  const input = context.requestPayload as InputType;
  const { videoId, userId, prompt } = input;

  const video = await context.run("get-video", async () => {
    const [existingVideo] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)));

    if (!existingVideo) {
      throw new Error("Video not found");
    }

    return existingVideo;
  });

  const uploadedThumbnailUrl = await context.run(
    "uploaded-thumbnail",
    async () => {
      const openai = new OpenAI();
      const response = await openai.responses.create({
        model: "gpt-5",
        input: prompt,
        tools: [
          {
            type: "image_generation",
            size: "1536x1024",
          },
        ],
      });

      const imageCall = response.output.find(
        (o) => o.type === "image_generation_call"
      );

      if (!imageCall?.result) {
        throw new Error("No image data received from OpenAI");
      }

      const imageBase64 = imageCall.result;

      const buffer = Buffer.from(imageBase64, "base64");

      const file = new File([buffer], "thumbnail.png", {
        type: "image/png",
      });

      const { data, error } = await utapi.uploadFiles(file);

      if (error || !data) {
        throw new Error("Upload failed");
      }

      return data;
    }
  );

  await context.run("cleanup-thumbnail", async () => {
    if (video.thumbnailKey) {
      await utapi.deleteFiles(video.thumbnailKey);
      await db
        .update(videos)
        .set({ thumbnailKey: null, thumbnailUrl: null })
        .where(and(eq(videos.id, videoId), eq(videos.userId, userId)));
    }
  });

  await context.run("update-video", async () => {
    await db
      .update(videos)
      .set({
        thumbnailKey: uploadedThumbnailUrl.key,
        thumbnailUrl: uploadedThumbnailUrl.ufsUrl,
      })
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)));
  });
});

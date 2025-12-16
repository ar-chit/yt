import { db } from "@/db";
import { videos } from "@/db/schema";
import { base64ToFile } from "@/lib/utils";
import { serve } from "@upstash/workflow/nextjs";
import { and, eq } from "drizzle-orm";
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

  const generatedThumbnail = await context.run(
    "generate-thumbnail",
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

      console.dir({ response }, { depth: null });

      const imageData = response.output
        .filter((output) => output.type === "image_generation_call")
        .map((output) => output.result);

      if (imageData.length <= 0) {
        throw new Error("No image data received from OpenAI");
      }

      const imageBase64 = imageData[0];
      if (!imageBase64) {
        throw new Error("No image data received from OpenAI");
      }

      return base64ToFile(imageBase64, "thumbnail.png");
    }
  );

  console.log({ generatedThumbnail });

  await context.run("cleanup-thumbnail", async () => {
    if (video.thumbnailKey) {
      await utapi.deleteFiles(video.thumbnailKey);
      await db
        .update(videos)
        .set({ thumbnailKey: null, thumbnailUrl: null })
        .where(and(eq(videos.id, videoId), eq(videos.userId, userId)));
    }
  });

  const uploadedThumbnailUrl = await context.run(
    "upload-thumbnail",
    async () => {
      const { data, error } = await utapi.uploadFiles(generatedThumbnail);

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error("Bad request");
      }

      return data;
    }
  );

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

import { db } from "@/db";
import { videos } from "@/db/schema";
import { serve } from "@upstash/workflow/nextjs";
import { and, eq } from "drizzle-orm";
import OpenAI from "openai";

interface InputType {
  userId: string;
  videoId: string;
  prompt: string;
}

export const { POST } = serve(async (context) => {
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

  const body = await context.run("generate-thumbnail", async () => {
    const openai = new OpenAI();
    const response = await openai.responses.create({
      model: "gpt-5",
      input: prompt,
      tools: [{
        type: "image_generation",
        size: "1536x1024",
       }],
    });

    const imageData = response.output
      .filter((output) => output.type === "image_generation_call")
      .map((output) => output.result);
    
    if (imageData.length > 0) {
      const imageBase64 = imageData[0];
   
    }
  });

  await context.run("update-video", async () => {
    const title = body.choices[0]?.message.content;

    if (!title) {
      throw new Error("Bad request");
    }

    await db
      .update(videos)
      .set({
        title: title || videos.title,
      })
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)));
  });
});

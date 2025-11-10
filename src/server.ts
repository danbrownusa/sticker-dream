import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { GoogleGenAI } from "@google/genai";
import { printToUSB, watchAndResumePrinters, getAllPrinters, printImage } from './print.ts';

const app = new Hono();
const PORT = 3000;

// Enable CORS for Vite dev server
app.use('/*', cors());

watchAndResumePrinters();

// Initialize Google AI
const ai = new GoogleGenAI({
  apiKey: process.env["GEMINI_API_KEY"],
});

/**
 * Generate an image using Imagen AI
 */

const imageGen4 = "imagen-4.0-generate-001";
const imageGen3 = "imagen-3.0-generate-002";
const imageGen4Fast = "imagen-4.0-fast-generate-001";
const imageGen4Ultra = "imagen-4.0-ultra-generate-001";

async function generateImage(prompt: string): Promise<Buffer | null> {
  console.log(`🎨 Generating image: "${prompt}"`);
  console.time('generation');

  const response = await ai.models.generateImages({
    model: imageGen4,
    prompt: `A black and white kids coloring page.
    <image-description>
    ${prompt}
    </image-description>
    ${prompt}`,
    config: {
      numberOfImages: 1,
      aspectRatio: "9:16"
    },
  });

  console.timeEnd('generation');

  if (!response.generatedImages || response.generatedImages.length === 0) {
    console.error('No images generated');
    return null;
  }

  const imgBytes = response.generatedImages[0].image?.imageBytes;
  if (!imgBytes) {
    console.error('No image bytes returned');
    return null;
  }

  return Buffer.from(imgBytes, "base64");
}

/**
 * API endpoint to generate image (without printing)
 */
app.post('/api/generate', async (c) => {
  const { prompt } = await c.req.json();

  if (!prompt) {
    return c.json({ error: 'Prompt is required' }, 400);
  }

  try {
    // Generate the image
    const buffer = await generateImage(prompt);

    if (!buffer) {
      return c.json({ error: 'Failed to generate image' }, 500);
    }

    // Send the image back to the client
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
      },
    });

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * API endpoint to get all available printers
 */
app.get('/api/printers', async (c) => {
  try {
    const printers = await getAllPrinters();
    return c.json({
      printers: printers.map(p => ({
        name: p.name,
        isDefault: p.isDefault,
        isUSB: p.isUSB,
        status: p.status
      }))
    });
  } catch (error) {
    console.error('⚠️ Failed to get printers:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * API endpoint to print an image
 */
app.post('/api/print', async (c) => {
  try {
    // Get printer name from header or query param
    const printerName = c.req.header('X-Printer-Name') || c.req.query('printer');

    // Get the image data from the request body
    const blob = await c.req.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let printResult;

    if (printerName) {
      // Print to specific printer
      const jobId = await printImage(printerName, buffer, {
        fitToPage: true,
        copies: 1
      });
      printResult = { printerName, jobId };
    } else {
      // Print to default USB printer
      printResult = await printToUSB(buffer, {
        fitToPage: true,
        copies: 1
      });
    }

    console.log(`✅ Print job submitted to ${printResult.printerName}`);

    return c.json({
      success: true,
      printerName: printResult.printerName,
      jobId: printResult.jobId
    });

  } catch (error) {
    console.error('⚠️ Printing failed:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  console.log(`🚀 Server running at http://localhost:${info.port}`);
});


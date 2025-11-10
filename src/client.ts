import { pipeline } from "@huggingface/transformers";

// Initialize the transcriber
const transcriber = await pipeline(
  "automatic-speech-recognition",
  "Xenova/whisper-tiny.en",
  {
    progress_callback: (event) => {
      // console.log(event);
    },
  }
);

// Get DOM elements
const recordBtn = document.querySelector(".record") as HTMLButtonElement;
const transcriptDiv = document.querySelector(".transcript") as HTMLDivElement;
const audioElement = document.querySelector("#audio") as HTMLAudioElement;
const imageDisplay = document.querySelector(
  ".image-display"
) as HTMLImageElement;
const printBtn = document.querySelector(".print-btn") as HTMLButtonElement;
const printerSelector = document.querySelector(".printer-selector") as HTMLDivElement;
const printerSelect = document.querySelector("#printer-select") as HTMLSelectElement;

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let recordingTimeout: number | null = null;
let currentImageBlob: Blob | null = null;
let selectedPrinter: string | null = null;
let isProcessing: boolean = false; // Track if we're currently processing a recording

// Load saved printer from localStorage
selectedPrinter = localStorage.getItem('selectedPrinter');

// Check for microphone access before showing the button
async function checkMicrophoneAccess() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream immediately, we just needed to check permission
    stream.getTracks().forEach((track) => track.stop());

    // Show the record button
    recordBtn.style.display = "block";
    transcriptDiv.textContent = "Press the button and imagine a sticker!";
  } catch (error) {
    console.error("Microphone access denied:", error);
    transcriptDiv.textContent =
      "❌ Microphone access required. Please enable microphone permissions in your browser settings.";
    recordBtn.style.display = "none";
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetRecorder() {
  audioChunks = [];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => {
    console.log(`Data available`, event);
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    console.log(`Media recorder stopped`);

    // Prevent duplicate processing if already processing
    if (isProcessing) {
      console.log("Already processing, ignoring duplicate onstop event");
      return;
    }

    isProcessing = true;

    // Remove recording class
    recordBtn.classList.remove("recording");
    recordBtn.classList.add("loading");
    recordBtn.textContent = "Imagining...";

    // Create audio blob and URL
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    const audioUrl = URL.createObjectURL(audioBlob);
    audioElement.src = audioUrl;

    // Transcribe
    transcriptDiv.textContent = "Transcribing...";
    const output = await transcriber(audioUrl);
    const text = Array.isArray(output) ? output[0].text : output.text;
    transcriptDiv.textContent = text;

    console.log(output);
    recordBtn.textContent = "Dreaming Up...";

    const abortWords = ["BLANK", "NO IMAGE", "NO STICKER", "CANCEL", "ABORT", "START OVER"];
    if(!text || abortWords.some(word => text.toUpperCase().includes(word))) {
      transcriptDiv.textContent = "No image generated.";
      recordBtn.classList.remove("loading");
      recordBtn.textContent = "Cancelled";
      setTimeout(() => {
        recordBtn.textContent = "Sticker Dream";
      }, 1000);
      isProcessing = false;
      resetRecorder();
      return;
    }

    // Generate the sticker (without printing)
    try {
      recordBtn.textContent = "Generating...";
      const response = await fetch("http://localhost:3000/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: text }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);

      // Store the image blob for printing later
      currentImageBlob = blob;

      // Display the image
      imageDisplay.src = imageUrl;
      imageDisplay.style.display = "block";

      // Show the print button
      printBtn.style.display = "block";

      // Stop loading state
      recordBtn.classList.remove("loading");
      recordBtn.textContent = "Generated!";
      setTimeout(() => {
        recordBtn.textContent = "Sticker Dream";
      }, 1000);
    } catch (error) {
      console.error("Error:", error);
      recordBtn.classList.remove("loading");
      recordBtn.textContent = "Error!";
      transcriptDiv.textContent = `${text}\n\nError: ${error instanceof Error ? error.message : "Unknown error"}`;
      setTimeout(() => {
        recordBtn.textContent = "Sticker Dream";
      }, 2000);
    }

    // Reset processing flag before resetting recorder
    isProcessing = false;

    // Reset recorder for next recording (but do it async to avoid blocking)
    setTimeout(() => resetRecorder(), 100);

  };
}

// Load available printers
async function loadPrinters() {
  try {
    const response = await fetch("http://localhost:3000/api/printers");
    if (!response.ok) {
      throw new Error("Failed to load printers");
    }

    const data = await response.json();
    const printers = data.printers;

    // Clear existing options
    printerSelect.innerHTML = '';

    if (printers.length === 0) {
      printerSelect.innerHTML = '<option value="">No printers found</option>';
      return;
    }

    // Add printer options
    printers.forEach((printer: any) => {
      const option = document.createElement('option');
      option.value = printer.name;
      option.textContent = `${printer.name}${printer.isDefault ? ' (Default)' : ''}${printer.isUSB ? ' 📌' : ''}`;
      printerSelect.appendChild(option);
    });

    // Select saved printer or default
    if (selectedPrinter) {
      printerSelect.value = selectedPrinter;
    } else {
      // Select the default printer
      const defaultPrinter = printers.find((p: any) => p.isDefault);
      if (defaultPrinter) {
        printerSelect.value = defaultPrinter.name;
        selectedPrinter = defaultPrinter.name;
        localStorage.setItem('selectedPrinter', selectedPrinter);
      }
    }

    // Show the printer selector
    printerSelector.style.display = "block";

  } catch (error) {
    console.error("Failed to load printers:", error);
    printerSelect.innerHTML = '<option value="">Error loading printers</option>';
  }
}

// Handle printer selection change
printerSelect.addEventListener('change', () => {
  selectedPrinter = printerSelect.value;
  localStorage.setItem('selectedPrinter', selectedPrinter);
  console.log(`Selected printer: ${selectedPrinter}`);
});

// Check microphone access on load
checkMicrophoneAccess();
resetRecorder();
loadPrinters();

// Start recording when button is pressed down
recordBtn.addEventListener("pointerdown", async () => {
  // Reset audio chunks
  audioChunks = [];
  console.log(`Media recorder`, mediaRecorder);
  // Start recording
  mediaRecorder.start();
  console.log(`Media recorder started`);
  recordBtn.classList.add("recording");
  recordBtn.textContent = "Listening...";

  // Auto-stop after 5 seconds
  recordingTimeout = window.setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
  }, 15000);
});

// Stop recording when button is released
recordBtn.addEventListener("pointerup", () => {
  console.log(`Media recorder pointerup`);
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  }
});

// Also stop if pointer leaves the button while held
recordBtn.addEventListener("pointerleave", () => {
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  }
});

// Prevent context menu on long press
recordBtn.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Print button click handler
printBtn.addEventListener("click", async () => {
  if (!currentImageBlob) {
    alert("No image to print!");
    return;
  }

  try {
    printBtn.textContent = "Printing...";
    printBtn.disabled = true;

    const headers: Record<string, string> = {
      "Content-Type": "image/png",
    };

    // Add selected printer to request header
    if (selectedPrinter) {
      headers["X-Printer-Name"] = selectedPrinter;
    }

    const response = await fetch("http://localhost:3000/api/print", {
      method: "POST",
      headers,
      body: currentImageBlob,
    });

    if (!response.ok) {
      throw new Error(`Print error: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("✅ Print job submitted:", result);

    printBtn.textContent = "Printed!";
    setTimeout(() => {
      printBtn.textContent = "Print Sticker";
      printBtn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error("Print error:", error);
    alert(
      "Failed to print: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
    printBtn.textContent = "Print Failed";
    setTimeout(() => {
      printBtn.textContent = "Print Sticker";
      printBtn.disabled = false;
    }, 2000);
  }
});

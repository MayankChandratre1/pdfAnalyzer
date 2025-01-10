import express from 'express';
import multer from 'multer';
import { AssistantsClient, AzureKeyCredential } from "@azure/openai-assistants";
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const router = express.Router();

// Configure multer for PDF file uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Helper function to handle Azure OpenAI Assistant interaction
async function processWithAssistant(pdfPath, question) {
  const assistantsClient = new AssistantsClient(
    process.env.AZURE_OPENAI_ENDPOINT,
    new AzureKeyCredential(process.env.AZURE_OPENAI_KEY)
  );

  try {
    // Create an assistant
    const assistant = await assistantsClient.createAssistant({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      name: "PDF Analyzer",
      instructions: "You are an AI assistant specialized in analyzing PDF documents. Please provide detailed analysis based on the content of the uploaded PDF.",
      tools: [{ type: "code_interpreter" }]
    });

    // Upload the PDF file
    const pdfContent = fs.readFileSync(pdfPath, { encoding: 'utf8', flag: 'r' });
    const uploadedFile = await assistantsClient.uploadFile(
      pdfContent,
      "assistants",
      { filename: pdfPath.split('/').pop() }
    );

    // Update assistant with the file
    await assistantsClient.updateAssistant(assistant.id, {
      fileIds: [uploadedFile.id]
    });

    // Create a thread
    const thread = await assistantsClient.createThread();

    // Add message to thread
    await assistantsClient.createMessage(
      thread.id,
      "user",
      question || "Please analyze this PDF document and provide key insights."
    );

    // Create and monitor run
    let run = await assistantsClient.createRun(thread.id, {
      assistantId: assistant.id
    });

    // Poll for completion
    while (run.status === "queued" || run.status === "in_progress") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      run = await assistantsClient.getRun(thread.id, run.id);
       console.log(run, "Run Waiting");
    }

    // Get messages
    const messages = await assistantsClient.listMessages(thread.id);
     console.log(messages, "Run Messages");
    
    // Clean up
    fs.unlinkSync(pdfPath);

    return messages.data;
  } catch (error) {
    fs.unlinkSync(pdfPath);
    console.log(error);
    
    throw error;
  }
}

router.get('/test-connection', async (req, res) => {
    try {
      const assistantsClient = new AssistantsClient(
        process.env.AZURE_OPENAI_ENDPOINT,
        new AzureKeyCredential(process.env.AZURE_OPENAI_KEY)
      );
      
      const assistant = await assistantsClient.createAssistant({
        model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        name: "Test Assistant",
        instructions: "Test instructions"
      });
      
      res.json({
        success: true,
        message: 'Connection successful',
        assistantId: assistant.id
      });
    } catch (error) {
      console.error('Connection test failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

// API Endpoint to analyze PDF
router.post('/analyze', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const question = req.body.question || null;
    const messages = await processWithAssistant(req.file.path, question);

    // Extract text content from messages
    const analysis = messages.map(message => {
      return {
        role: message.role,
        content: message.content.map(c => c.type === 'text' ? c.text.value : null).filter(Boolean)
      };
    });

    res.json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
import express from 'express';
import multer from 'multer';
import { AssistantsClient, AzureKeyCredential } from "@azure/openai-assistants";
import dotenv from 'dotenv';
import fs from 'fs';
import {PDFExtract} from 'pdf.js-extract';

dotenv.config();

const router = express.Router();

const extractPdfText = async (buffer) => {
  const pdfExtract = new PDFExtract();
  const options = {}; // Add any specific options if needed
  const chunks = [];
  const maxChunkSize = 2000;

  return new Promise((resolve, reject) => {
    pdfExtract.extractBuffer(buffer, options, (err, data) => {
      if (err) {
        console.error(err, "Error PDF Extractor");
        return reject(err);
      }

      const pages = data.pages;
      pages.forEach((page) => {
        let ch = "";
        page.content.forEach((chunk) => {
          console.log("\n=>", chunk.str);
          if ((ch + chunk.str).length > maxChunkSize) {
            chunks.push(ch);
            ch = chunk.str;
          } else {
            ch += chunk.str;
          }
        });

        // Push the last chunk if there's remaining content
        if (ch.length > 0) {
          chunks.push(ch);
        }
      });

      resolve(chunks);
    });
  });
};


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
    const pdfContent = fs.readFileSync(pdfPath);
    const textChunks = await extractPdfText(pdfContent)
    const thread = await assistantsClient.createThread();
    for (const chunk of textChunks) {
      await assistantsClient.createMessage(
        thread.id,
        "user",
        "Here's a part of the PDF content: " + chunk
      );
    }

    // Create a thread

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
      let timeout = 10000
      await new Promise(resolve => setTimeout(resolve, timeout));
      if(timeout > 2000) timeout -= 2000
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
    const assistanceResponse = analysis.map(message => {
      if(message.role == 'assistant')
        return message.content
      else
        return ""
    })

    const reducedResponse = assistanceResponse.reduce((res, message) => res+message+" ","").trim()
    res.json({
      success: true,
      analysis: reducedResponse
    });

  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


router.get("/testpdf", upload.single('pdf'), async (req, res) => {
  try{
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }
    const pdfContent = fs.readFileSync(req.file.path);
    console.log(pdfContent);
    const chunks = await extractPdfText(pdfContent)
    fs.unlinkSync(req.file.path);
    res.send(chunks)
  }catch(Err){
    console.log(Err);
    res.send("err")
    
  }
})

export default router;
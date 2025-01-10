import express from 'express';
import pdfAnalyzerRouter from './routes/pdfAnalyzer.js';

const app = express();
app.use('/api', pdfAnalyzerRouter);

app.listen(3002, ()=>{
    console.log("Listening 3002");
    
})
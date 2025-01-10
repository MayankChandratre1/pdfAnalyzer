## Setup:
1. Clone the repo `git clone https://github.com/MayankChandratre1/pdfAnalyzer.git`
2. `cd pdfAnalyzer`
3. `npm install`
4. Setup .env file as 
   ```
   AZURE_OPENAI_KEY=
   AZURE_OPENAI_ENDPOINT=
   AZURE_OPENAI_REGION=
   OPENAI_API_VERSION=
   AZURE_OPENAI_DEPLOYMENT_NAME=
   ```

5. `node index.js`

## How to test on Postman
First, make sure your Express server is running and the endpoint is accessible.

1. Open Postman and create a new request:

2. Set the HTTP method to POST
Enter your endpoint URL (e.g., http://localhost:3002/api/analyze)


3. Set up the request body:

    In Postman, go to the "Body" tab
    Select "form-data" (this is important for file uploads)

    Add two key-value pairs:
   - Key: pdf (Type: File)
     Click on the dropdown next to the key and select "File"
     Value: Select your PDF file

   - Key: question (Type: Text)
     Value: "Please analyze this document and provide key insights"

4. Hit Send
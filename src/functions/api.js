const { app, output } = require('@azure/functions');
const multipart = require('parse-multipart-data');
const axios = require('axios');
const sql = require('mssql');

const CHAVE_API_KEY = 
const endpoint = "https://brazilsouth.api.cognitive.microsoft.com/";

const queueOutput = output.storageQueue({
    queueName: 'fila-totais',
    connection: 'AzureWebJobsStorage'
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

app.http('analisarUpload', {
    methods: ['POST'],
    authLevel: 'anonymous',
    extraOutputs: [queueOutput],
    handler: async (request, context) => {
        try {
            const bodyBuffer = Buffer.from(await request.arrayBuffer());
            const contentType = request.headers.get('content-type');

            if (!contentType || !contentType.includes('boundary=')) {
                return { status: 400, jsonBody: { erro: "Formato inválido. Precisa ser multipart/form-data." } };
            }

            const boundary = contentType.split('boundary=')[1];
            const parts = multipart.parse(bodyBuffer, boundary);

            if (!parts.length) {
                return { status: 400, jsonBody: { erro: "Nenhum arquivo enviado." } };
            }

            const arquivo = parts[0];
            context.log('Enviando para processamento no Document Intelligence...');

            const response = await axios.post(
                `${endpoint}documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=2024-11-30`,
                arquivo.data,
                {
                    headers: {
                        'Ocp-Apim-Subscription-Key': CHAVE_API_KEY,
                        'Content-Type': 'application/octet-stream'
                    }
                }
            );

            context.log(`Imagem em processamento, aguardando IA...`);

            let analise = await axios.get(response.headers['operation-location'], {
                headers: { 'Ocp-Apim-Subscription-Key': CHAVE_API_KEY }
            });

            while (analise.data.status === 'running') {
                await sleep(5000);
                analise = await axios.get(response.headers['operation-location'], {
                    headers: { 'Ocp-Apim-Subscription-Key': CHAVE_API_KEY }
                });
            }

            const fields = analise.data.analyzeResult.documents[0].fields;
            let totalRecibo = "0";

            if (fields && fields.Total) {
                totalRecibo = fields.Total.content || fields.Total.valueNumber.toString();
            }

            context.log(`Total Extraído do Recibo: ${totalRecibo}`);

            context.extraOutputs.set(queueOutput, totalRecibo);

            return {
                status: 200,
                jsonBody: {
                    mensagem: "Processado com sucesso e total enviado para a fila!",
                    total_extraido: totalRecibo
                }
            };

        } catch (err) {
            context.log(err.message);
            return { status: 500, jsonBody: { erro: err.message } };
        }
    }
});

app.storageQueue('consumirFila', {
    queueName: 'fila-totais',
    connection: 'AzureWebJobsStorage',
    handler: async (queueItem, context) => {
        context.log(`Lendo da fila o valor: ${queueItem}`);

        try {
            await sql.connect(process.env.SqlConnectionString);
            await sql.query`INSERT INTO RECIBO (TOTAL) VALUES (${queueItem})`;
            context.log('Valor inserido no banco de dados com sucesso!');
        } catch (err) {
            context.log("Erro ao inserir no banco: ", err.message);
        }
    }
});

app.http('listarTotais', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            await sql.connect(process.env.SqlConnectionString);
            const result = await sql.query`SELECT * FROM RECIBO`;

            return {
                status: 200,
                jsonBody: {
                    totais_salvos_no_banco: result.recordset
                }
            };
        } catch (err) {
            return { status: 500, jsonBody: { erro: err.message } };
        }
    }
});
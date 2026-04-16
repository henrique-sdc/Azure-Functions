const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function enviarImagem() {
    const URL = "https://appfunctions15232455.azurewebsites.net/api/analisarUpload";

    const form = new FormData();
    form.append('file', fs.createReadStream('./contoso-receipt.png'));

    const response = await axios.post(URL, form, {
        headers: form.getHeaders()
    });

    return response.data;
}

const main = async () => {
    try {
        console.log("[INFO] Iniciando upload e processamento da imagem...");
        const resposta = await enviarImagem();

        console.log("[SUCCESS] Processamento concluído:");
        console.log(resposta);
        console.log("\n[INFO] Consulte os registros no banco de dados acessando:");
        console.log("https://appfunctions15232455.azurewebsites.net/api/listarTotais");
    } catch (err) {
        console.error("[ERROR] Falha na requisição:", err.response ? err.response.data : err.message);
    }
}

main();
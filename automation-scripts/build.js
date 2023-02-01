const { dirname } = require('path');
const swagger = require('@apidevtools/swagger-cli');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const yaml = require('js-yaml');
const fs = require('fs');

const PROJECT_ROOT_DIR = dirname(require.main.filename).replace('\\automation-scripts', '');
const DICT_PATH = PROJECT_ROOT_DIR + '/dictionary';
const COMPONENTS_BASE_PATH = PROJECT_ROOT_DIR + '/swagger-components';
const GENERATED_SWAGGERS_PATH = PROJECT_ROOT_DIR + '/swagger-apis-test';
const TEMP_GEN_DICTIONARY_DIR = PROJECT_ROOT_DIR + '/temp-dict-dir';
const separator = '====================================';

const APIS = [
    //"accounts",
    //"acquiring_services",
    //"capitalization_bonds",
    //"consents",
    //"credit_cards",
    //"customers",
    //"exchange",
    //"financings",
    //"insurances",
    //"investments",
    //"invoice_financings",
    //"loans",
    "payments",
    //"pension",
    //"resources",
    //"unarranged_accounts_overdraft",
]

const showOpenAPILogs = false;
const showDicionaryLogs = false;

main();

async function main() {
    console.log(separator);

    // Itera sobre o array de APIs
    for (let i = 0; i < APIS.length; i++) {
        // Nome da API que está sendo trabalhada nessa iteração
        let api = APIS[i];

        console.log('API: ' + api);

        // Parâmetros da API atual
        let partPath = `${COMPONENTS_BASE_PATH}/_${api}_apis_part.yml`;
        let version = getVersion(partPath);

        // Caminho do bundle de saída
        let outputPath = `${GENERATED_SWAGGERS_PATH}/${api}/${version}.yml`;

        // Caminho do bundle temporário para gerar o dicionário
        let outputTempPath = `${TEMP_GEN_DICTIONARY_DIR}/${api}/${version}.yml`;

        // Objetos de configuração dos bundles
        let opt = swaggerOptGenerate(outputPath, false);
        let optTemp = swaggerOptGenerate(outputTempPath, true);

        // Criação dos Bundles
        await bundle(api, opt, partPath);
        await bundle(api, optTemp, partPath);

        // Valida se o bundle gerado é compatível com o padrão swagger
        let isValid = await validate(opt.outfile);

        console.log(`Version: ${version}`);
        console.log(`Is a valid swagger? ${isValid}`);

        // Valida se o bundle gerado é compatível com o padrão Open API
        let openAPIValidateResult = await openAPIValidate(outputPath);

        console.log(`Is a valid Open API? ${openAPIValidateResult.isValid}`);

        let dictionaryResult = await dictionaryGenerate(outputTempPath);

        console.log(`Is a valid Dictionary? ${dictionaryResult.isValid}`);

        // Caso não seja compátivel com o padrão Open API
        if (showOpenAPILogs)
            showValidateLogs(openAPIValidateResult, 'Open API');

        // Caso não seja compátivel com o padrão Open API
        if (showDicionaryLogs)
            showValidateLogs(dictionaryResult, 'Dictionary');

        console.log(separator);
    }

    fs.rmdirSync(TEMP_GEN_DICTIONARY_DIR, { recursive: true, force: true });
}

// Exibe os logs de forma detalhada
function showValidateLogs(openAPIValidateResult, sufix) {
    if (!openAPIValidateResult.isValid) {
        console.log(`\nValidation errors: ${sufix}`)

        if (openAPIValidateResult.output)
            console.log(openAPIValidateResult.output)

        if (openAPIValidateResult.error)
            console.log(openAPIValidateResult.error)

        if (openAPIValidateResult.cmdError)
            console.log(openAPIValidateResult.cmdError)
    }
}

// Retorna a versão da API
function getVersion(partPath) {
    return yaml.load(fs.readFileSync(partPath, 'utf8')).info.version;
}

// Gera o objeto de options do Swagger
// dereference deve ser false para bundles
// dereference deve ser true para Dictionaries
function swaggerOptGenerate(outputPath, dereference) {
    return {
        outfile: `${outputPath}`,
        dereference: dereference,
        type: 'yaml'
    }
}

// Gera o bundle a partir dos componentes
async function bundle(api, opt, partPath) {
    try {
        await swagger.bundle(partPath, opt);
    }
    catch (e) {
        console.log(`ERROR: ${e.message}`);
    }
}

// Valida o bundle gerado
async function validate(path) {
    try {
        await swagger.validate(path);
        return true;
    }
    catch (e) {
        console.log(`ERROR: ${e.message}`);
        return false;
    }
}

// Valida se o Swagger gerado segue as especificações de Open API
async function openAPIValidate(outputPath) {
    try {

        let pycmd = isLinux() ? 'python3' : 'python';

        let result = await execPromise(`${pycmd} -m openapi_spec_validator "${outputPath}"`);

        formatedOutput = result.stdout.replace('# Validation Error', '').replace('\n', '')
        let openResult =
        {
            isValid: result.stdout == 'OK',
            error: result.stderr,
            cmdError: result.cmdError,
            output: formatedOutput
        }

        return openResult;
    }
    catch (e) {
        console.log(`ERROR: ${e.message}`);
        return null;
    }
}

// Retorna se o OS é linux ou não
function isLinux() {
    var opsys = process.platform;

    if (opsys == "linux") {
        return true;
    }

    return false;
}

// Gera os dicionários a partir de um script Ruby
async function dictionaryGenerate(outputPath) {
    try {
        var result = await execPromise(`ruby ${PROJECT_ROOT_DIR}/automation-scripts/dictionary_generator -c -f "${outputPath}" -o ${DICT_PATH}`);

        let isValid = true;

        if (result.stderr)
            isValid = false;

        if (result.cmdError)
            isValid = false;

        let dictionaryResult =
        {
            isValid: isValid,
            error: result.stderr,
            cmdError: result.cmdError,
            output: result.stdout
        };

        return dictionaryResult;
    }
    catch (e) {
        console.log(`ERROR: ${e.message}`);
        return null;
    }
}

// Função auxiliar para retorno de promises
function execPromise(command) {
    return new Promise(function (resolve, reject) {
        exec(command, (error, stdout, stderr) => {
            let result = { stdout: stdout.trim(), stderr: stderr.trim(), error: error };
            resolve(result);
        });
    });
}   
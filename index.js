const fs = require("fs");
const url = require("url");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const querystring = require("querystring");

const {client_id, client_secret, api_key} = require("./auth/credentials.json");
const redirect_uri = "http://localhost:3000/bitcallback/"
const port = 3000;

const all_sessions = [];
const server = http.createServer();

server.on("listening", listen_handler);
server.listen(port);
function listen_handler(){
	console.log(`Now Listening on Port ${port}`);
}

server.on("request", request_handler);
function request_handler(req, res){
    console.log(`New Request from ${req.socket.remoteAddress} for ${req.url}`);
    if(req.url === "/"){
        const form = fs.createReadStream("html/index.html");
		res.writeHead(200, {"Content-Type": "text/html"})
        form.pipe(res);
        console.log("sent form to user");
    }
    else if(req.url === "/favicon.ico"){
        const WVjpg = fs.createReadStream("images/favicon.ico");
		res.writeHead(200, {"Content-Type": "image/x-icon"})
		WVjpg.pipe(res);
    }
    else if(req.url === "/images/WorldVirus.jpg"){
        const WVjpg = fs.createReadStream("images/WorldVirus.jpg");
		res.writeHead(200, {"Content-Type": "image/jpg"})
		WVjpg.pipe(res);
    }
    else if(req.url === "/images/mask.png"){
        const Mpng = fs.createReadStream("images/mask.png");
		res.writeHead(200, {"Content-Type": "image/png"})
		Mpng.pipe(res);
    }
    else if (req.url.startsWith("/submit_form")){
        console.log("recieved form from user");
		let user_input = url.parse(req.url, true).query;
		if(user_input === null){
			not_found(res);
		}
		const {urlToScan} = user_input;
		const state = crypto.randomBytes(20).toString("hex");
        all_sessions.push({urlToScan,state});
        
        //if cached token, skip to get_url_scan(user_input, access_token, res)
        const cache_file = "./cache/cache.json";
        let cache_valid = false;
        if(fs.existsSync(cache_file)){
            access_token_object = require(cache_file);
            //check for valid date
            if(new Date(access_token_object.expiration) > Date.now()){
                cache_valid = true;
            }
            //check for valid object (in case something else is stored)
            if(typeof access_token_object.access_token != "string"){
                cache_valid = false;
            }
        }
        if(cache_valid){
            get_url_scan(user_input, access_token_object.access_token, res)
        }
        else{
            redirect_to_bitly(state, res);
        }
	}
	else if(req.url.startsWith("/bitcallback")){
        const {state, code} = url.parse(req.url, true).query; 
		let session = all_sessions.find(session => session.state === state);
        if(code === undefined || state === undefined || session === undefined){
			not_found(res);
			return;
		}
		const {urlToScan} = session;
		send_access_token_request(code, {urlToScan}, res);
    }
    else{
		not_found(res);
    }
}

function not_found(res){
	res.writeHead(404, {"Content-Type": "text/html"});
	res.end(`<h1>404 Not Found</h1>`);
}

function api_Invalid_response(response, res, api){
    res.writeHead(400, {"Content-Type": "text/html"});
	res.end(`<h1>An error from calling the ${api} api has occured </h1> <p>Here is the error response:</p> <p>message: ${response.message}</p> <p>description: ${response.description}</p>`);
}

function redirect_to_bitly(state, res){
	const authorization_endpoint = "https://bitly.com/oauth/authorize";
    let uri = querystring.stringify({client_id,state,redirect_uri});
	res.writeHead(302, {Location: `${authorization_endpoint}?${uri}`})
       .end();
    console.log("redirected user to bitly for authentication");
}

function send_access_token_request(code, user_input, res){
	const token_endpoint = "https://api-ssl.bitly.com/oauth/access_token";
	const post_data = querystring.stringify({client_id, client_secret, code, redirect_uri});
	let options = {
		method: "POST",
		headers:{ "Content-Type":"application/x-www-form-urlencoded" }
    }
    const token_request_time = new Date();
	const token_request = https.request(token_endpoint, options);
    token_request.once("error", err => {throw err}); //for timeout issues
    token_request.once("response", (token_stream) => process_stream(token_stream, recieve_token, user_input,token_request_time, res))
    token_request.end(post_data);
    console.log("sent http request to get access token to bitly");
}
function process_stream (stream, callback , ...args){
	let package = "";
	stream.on("data", chunk => package += chunk);
	stream.on("end", () => callback(package, ...args));
}

function recieve_token(package, user_input, token_request_time, res){
    const result = querystring.parse(package);
    create_access_token_cache(result, token_request_time);
	get_url_scan(user_input, result.access_token, res); 
}

function get_url_scan(user_input, access_token, res){
	const {urlToScan} = user_input;
    const url_scan_endpoint = `https://urlscan.io/api/v1/scan/`; 
    const post_data = JSON.stringify({url:`${urlToScan}`, visibility:"unlisted"});
    let options = {
		method: "POST",
		headers:{
            "Content-Type":"application/json",
            "API-Key":`${api_key}`
        }
	}
	const url_scan_request = https.request(url_scan_endpoint, options);
    url_scan_request.once("error", err => {throw err}); //for timeout issues
    url_scan_request.once("response",(url_result_stream) => process_stream(url_result_stream, receive_url_results, access_token, res));
    url_scan_request.end(post_data);
    console.log("sent http request to get url scanned to urlscan.io");
}

function receive_url_results(package, access_token, res){
	const scanResult = JSON.parse(package);
    if(scanResult.message === "Submission successful") shorten_scan_result(scanResult, access_token, res); 
    else{
        api_Invalid_response(scanResult, res, "urlscan.io");
    }
}

function shorten_scan_result(scanResult, access_token, res){ 
    const task_endpoint = "https://api-ssl.bitly.com/v4/bitlinks";
	const options = {
		method: "POST",
		headers: {
            "Authorization": `Bearer ${access_token}`,
			"Content-Type": "application/json"
		}
	}
	const post_data = JSON.stringify({ "long_url":`${scanResult.result}`, "title": "Urlscan.io result created by ShortUrlScanner"});
    const shorten_url_request =
    https.request(task_endpoint, options);
    shorten_url_request.once("error", err => {throw err}); //for timeout issues
    shorten_url_request.once("response",(task_stream) => process_stream(task_stream, receive_shorten_response, res));
    shorten_url_request.end(post_data);
    console.log("sent http request to shorten link to bitly");
}

function receive_shorten_response(package, res){
	const bitly_results = JSON.parse(package);
    if(typeof bitly_results.link != "undefined") create_result_page(bitly_results, res);
    else{
        api_Invalid_response(bitly_results, res, "bit.ly");
    }
}

function create_result_page(bitly_results, res){ 
	res.writeHead(200, {"Content-Type": "text/html"});
    res.end(`<body style="text-align: center; background-color: rgb(29, 47, 87); color: rgb(23, 255, 23);">
    <h1>Here is the shortened Bit.ly link to your scan results:</h1> 
    <p><a href="${bitly_results.link}" style="color: rgb(23, 255, 23);">${bitly_results.link}</a></p>
    <p style="color: rgb(23, 255, 23);"> Warning! it may take up to 2 minutes until urlscan.io to finish scanning!</p>
    </body>`);
    console.log("sent results to user");
}

function create_access_token_cache(access_token_object, token_request_time){
    access_token_object.expiration = new Date(token_request_time.getTime() + (3600 * 1000));//arbitrary as no expiration date is given, the spotify example seems like a reasonable time
    fs.writeFile('./cache/cache.json', JSON.stringify(access_token_object),()=>{console.log("cached access token")});
}
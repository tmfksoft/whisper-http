import path from 'path';
import fs from 'fs';
import ffmpeg from 'ffmpeg';
import { v4 as uuid } from 'uuid';
import Hapi from '@hapi/hapi';

//@ts-ignore --- NEEDS TYPES :(!
import { whisper } from 'whisper-node';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

interface HapiFile extends Readable {
	hapi: {
		filename: string,
		headers: {
			[key: string]: string,
		}
	}
}

class WhisperAPI {

	public Server: Hapi.Server;
	public tempDir = path.join(__dirname, "..", "tmp");

	constructor() {
		this.Server = new Hapi.Server({
			port: process.env.PORT || 8080,
		});

		if (!fs.existsSync(this.tempDir)) {
			fs.mkdirSync(this.tempDir);
		}
	}

	async convertAudio(sourcePath: string, destPath: string): Promise<void> {
		const ff = await new ffmpeg(sourcePath);
		ff.addCommand('-y', ''); // Overwrite
		ff.setAudioChannels(1); // Mono
		ff.setAudioFrequency(16000); // 16Khz
		//ff.addCommand('-f', 's16le');
		//ff.addCommand('-acodec', 'pcm_s16le')
		//ff.setAudioCodec("pcm_s16le"); // WAV / PCM
		await ff.save(destPath);
	}

	async transcribe(wavPath: string): Promise<{ speech: string }[]> {
		return whisper(wavPath, {
			modelPath: path.join(__dirname, "..", "ggml-base.en.bin"),
		});
	}

	async start() {
		this.Server.route({
			path: "/v1/transcribe",
			method: "POST",
			options: {
				payload: {
					parse: true,
					allow: 'multipart/form-data',
					multipart: { output: 'stream' },
					//output: "stream",
				}
			},
			handler: async (req, h) => {
				const payload = req.payload as { audio: HapiFile };
				const rawPath = path.join(this.tempDir, payload.audio.hapi.filename || `${uuid()}_raw.wav`);
				const convertedPath = path.join(this.tempDir, `${uuid()}_converted.wav`);

				try {
				const fd = fs.createWriteStream(rawPath);
				await pipeline(payload.audio, fd);
				} catch (e) {
					console.log("Failed to save audio file!", e);
					throw e;
				}
				
				try {
					await this.convertAudio(rawPath, convertedPath);
				} catch (e) {
					console.log("Failed to convert audio file!", e);
					throw e;
				}

				try {
					const transcription = await this.transcribe(convertedPath);
					fs.unlinkSync(rawPath);
					fs.unlinkSync(convertedPath);
					return {
						scentence: transcription.map((word) => word.speech).join("").trim(),
						raw: transcription,
					};
				} catch (e) {
					console.log("Failed to transcribe audio file!", e);
					throw e;
				}
			}
		});

		await this.Server.start();
	}
}
const api = new WhisperAPI();
api.start();
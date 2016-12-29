import * as os from "os";
import * as osenv from "osenv";
import * as path from "path";
import {quoteString} from "./helpers";

export class SysInfoBase implements ISysInfo {
	constructor(protected $childProcess: IChildProcess,
				protected $hostInfo: IHostInfo,
				protected $iTunesValidator: Mobile.IiTunesValidator,
				protected $logger: ILogger,
				protected $winreg: IWinReg) { }

	private monoVerRegExp = /version (\d+[.]\d+[.]\d+) /gm;
	private sysInfoCache: ISysInfoData = undefined;
	private javaVerCache: string = null;
	public async getJavaVersion(): Promise<string> {
			if (!this.javaVerCache) {
				try {
					// different java has different format for `java -version` command
					let output = (await  this.$childProcess.spawnFromEvent("java", ["-version"], "exit")).stderr;
					this.javaVerCache = /(?:openjdk|java) version \"((?:\d+\.)+(?:\d+))/i.exec(output)[1];
				} catch (e) {
					this.javaVerCache = null;
				}
			}
			return this.javaVerCache;
	}

	private npmVerCache: string = null;
	public getNpmVersion(): string {
		if (!this.npmVerCache) {
			let procOutput = this.exec("npm -v");
			this.npmVerCache = procOutput ? procOutput.split("\n")[0] : null;
		}

		return this.npmVerCache;
	}

	private javaCompilerVerCache: string = null;
	public async getJavaCompilerVersion(): Promise<string> {
			if (!this.javaCompilerVerCache) {
				try {
					let javaCompileExecutableName = "javac";
					let javaHome = process.env.JAVA_HOME;
					let pathToJavaCompilerExecutable = javaHome ? path.join(javaHome, "bin", javaCompileExecutableName) : javaCompileExecutableName;
					let output = this.exec(`"${pathToJavaCompilerExecutable}" -version`, { showStderr: true });
					// for other versions of java javac version output is not on first line
					// thus can't use ^ for starts with in regex
					this.javaCompilerVerCache = output ? /javac (.*)/i.exec(output.stderr)[1] : null;
				} catch (e) {
					this.javaCompilerVerCache = null;
				}
			}
			return this.javaCompilerVerCache;
	}

	private xCodeVerCache: string = null;
	public async getXCodeVersion(): Promise<string> {
			if (!this.xCodeVerCache) {
				try {
					this.xCodeVerCache = this.$hostInfo.isDarwin ? this.exec("xcodebuild -version") : null;
				} catch (e) {
					this.xCodeVerCache = null;
				}
			}
			return this.xCodeVerCache;
	}

	private nodeGypVerCache: string = null;
	public async getNodeGypVersion(): Promise<string> {
				if (!this.nodeGypVerCache) {
					try {
						this.nodeGypVerCache = this.exec("node-gyp -v");
					 } catch (e) {
						this.nodeGypVerCache = null;
					}
				}
				return this.nodeGypVerCache;
	}

	private xcodeprojGemLocationCache: string = null;
	public async getXCodeProjGemLocation(): Promise<string> {
			if (!this.xcodeprojGemLocationCache) {
				try {
					this.xcodeprojGemLocationCache = this.$hostInfo.isDarwin ? this.exec("gem which xcodeproj") : null;
				} catch (e) {
					this.xcodeprojGemLocationCache = null;
				}
			}
			return this.xcodeprojGemLocationCache;
	}

	private itunesInstalledCache: boolean = null;

	public getITunesInstalled(): boolean {
		if (!this.itunesInstalledCache) {
			try {
				this.itunesInstalledCache = this.$iTunesValidator.getError() === null;
			} catch (e) {
				this.itunesInstalledCache = null;
			}
		}
		return this.itunesInstalledCache;
	}

	private cocoapodVersionCache: string = null;
	public async getCocoapodVersion(): Promise<string> {
			if (!this.cocoapodVersionCache) {
				try {
					if (this.$hostInfo.isDarwin) {
						let cocoapodVersion = this.exec("pod --version");
						if (cocoapodVersion) {
							// Output of pod --version could contain some warnings. Find the version in it.
							let cocoapodVersionMatch = cocoapodVersion.match(/^((?:\d+\.){2}\d+.*?)$/gm);
							if (cocoapodVersionMatch && cocoapodVersionMatch[0]) {
								cocoapodVersion = cocoapodVersionMatch[0].trim();
							}
							this.cocoapodVersionCache = cocoapodVersion;
						}
					}
				} catch (e) {
					this.cocoapodVersionCache = null;
				}
			}

			return this.cocoapodVersionCache;
	}

	public async getSysInfo(pathToPackageJson: string, androidToolsInfo?: {pathToAdb: string, pathToAndroid: string}): Promise<ISysInfoData> {
			if (!this.sysInfoCache) {
				let res: ISysInfoData = Object.create(null);
				let procOutput: string;

				let packageJson = require(pathToPackageJson);
				res.procInfo = packageJson.name + "/" + packageJson.version;

				// os stuff
				res.platform = os.platform();
				res.os = this.$hostInfo.isWindows ? this.winVer() : this.unixVer();
				res.shell = osenv.shell();
				try {
					res.dotNetVer = await  this.$hostInfo.dotNetVersion();
				} catch(err) {
					res.dotNetVer = ".Net is not installed.";
				}

				// node stuff
				res.procArch = process.arch;
				res.nodeVer = process.version;

				res.npmVer = this.getNpmVersion();

				res.javaVer = await  this.getJavaVersion();

				res.nodeGypVer = await  this.getNodeGypVersion();
				res.xcodeVer = await  this.getXCodeVersion();
				res.xcodeprojGemLocation = await  this.getXCodeProjGemLocation();
				res.itunesInstalled = this.getITunesInstalled();

				res.cocoapodVer = await  this.getCocoapodVersion();
				let pathToAdb = androidToolsInfo ? androidToolsInfo.pathToAdb : "adb";
				let pathToAndroid = androidToolsInfo ? androidToolsInfo.pathToAndroid : "android";

				if(!androidToolsInfo) {
					this.$logger.trace("'adb' and 'android' will be checked from PATH environment variable.");
				}

				procOutput = this.exec(`${quoteString(pathToAdb)} version`);
				res.adbVer = procOutput ? procOutput.split(os.EOL)[0] : null;

				res.androidInstalled = await  this.checkAndroid(pathToAndroid);

				procOutput = this.exec("mono --version");
				if (!!procOutput) {
					let match = this.monoVerRegExp.exec(procOutput);
					res.monoVer = match ? match[1] : null;
				} else {
					res.monoVer = null;
				}

				procOutput = this.exec("git --version");
				res.gitVer = procOutput ? /^git version (.*)/.exec(procOutput)[1]  : null;

				procOutput = this.exec("gradle -v");
				res.gradleVer = procOutput ? /Gradle (.*)/i.exec(procOutput)[1] : null;

				res.javacVersion = await  this.getJavaCompilerVersion();

				this.sysInfoCache = res;
			}

			return this.sysInfoCache;
	}

	private exec(cmd: string, execOptions?: IExecOptions): string | any {
		try {
			if(cmd) {
				return await this.$childProcess.exec(cmd, null, execOptions);
			}
		} catch(e) {
			// if we got an error, assume not working
		}

		return null;
	}

	// `android -h` returns exit code 1 on successful invocation (Mac OS X for now, possibly Linux). Therefore, we cannot use $childProcess
	private async checkAndroid(pathToAndroid: string): Promise<boolean> {
			let result = false;
			try {
				if(pathToAndroid) {
					let androidChildProcess = await  this.$childProcess.spawnFromEvent(pathToAndroid, ["-h"], "close", {}, {throwError: false});
					result = androidChildProcess && androidChildProcess.stdout && _.includes(androidChildProcess.stdout, "android");
				}
			} catch(err) {
				this.$logger.trace(`Error while checking is ${pathToAndroid} installed. Error is: ${err.messge}`);
			}

			return result;
	}

	private winVer(): string {
		try {
			return await this.readRegistryValue("ProductName") + " " +
					await this.readRegistryValue("CurrentVersion") + "." +
					await this.readRegistryValue("CurrentBuild");
		} catch (err) {
			this.$logger.trace(err);
		}

		return null;
	}

	private async readRegistryValue(valueName: string): Promise<string> {
			return await this.$winreg.getRegistryValue(valueName, this.$winreg.registryKeys.HKLM, '\\Software\\Microsoft\\Windows NT\\CurrentVersion').value;
	}

	private unixVer(): string {
		return this.exec("uname -a");
	}
}
$injector.register("sysInfoBase", SysInfoBase);

import type { AttributeValue, Span, TimeInput, Tracer } from '@opentelemetry/api';
import { diag, DiagConsoleLogger, trace } from '@opentelemetry/api';
import { DiagLogLevel } from '@opentelemetry/api/build/src/diag/types';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
	BasicTracerProvider,
	BatchSpanProcessor,
	ConsoleSpanExporter,
	SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import type { HttpsProxyAgent } from 'https-proxy-agent';
import type { TelemetryContext, TelemetryProvider } from './telemetry';

export class OpenTelemetryProvider implements TelemetryProvider {
	private _globalAttributes: Record<string, AttributeValue> = {};
	private readonly tracer: Tracer;

	constructor(context: TelemetryContext, agent?: HttpsProxyAgent, debugging?: boolean) {
		const provider = new BasicTracerProvider({
			resource: new Resource({
				[SemanticResourceAttributes.SERVICE_NAME]: 'gitlens',
				[SemanticResourceAttributes.SERVICE_VERSION]: context.extensionVersion,
				[SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: context.env,
				[SemanticResourceAttributes.DEVICE_ID]: context.machineId,
				[SemanticResourceAttributes.OS_TYPE]: context.platform,
				'extension.id': context.extensionId,
				'session.id': context.sessionId,
				language: context.language,
				'vscode.edition': context.vscodeEdition,
				'vscode.version': context.vscodeVersion,
				'vscode.host': context.vscodeHost,
			}) as any,
		});

		if (debugging) {
			diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE);
			provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
		}

		const exporter = new OTLPTraceExporter({
			url: debugging
				? 'https://otel-dev.gitkraken.com:4318/v1/traces'
				: 'https://otel.gitkraken.com:4318/v1/traces',
			compression: 'gzip' as any,
			httpAgentOptions: agent?.options,
		});
		provider.addSpanProcessor(debugging ? new SimpleSpanProcessor(exporter) : new BatchSpanProcessor(exporter));

		provider.register();

		this.tracer = trace.getTracer(context.extensionId);
	}

	dispose(): void {
		trace.disable();
	}

	sendEvent(name: string, data?: Record<string, AttributeValue>, startTime?: TimeInput, endTime?: TimeInput): void {
		const span = this.tracer.startSpan(name, { startTime: startTime ?? Date.now() });
		span.setAttributes(this._globalAttributes);
		if (data != null) {
			span.setAttributes(data);
		}
		span.end(endTime);
	}

	startEvent(name: string, data?: Record<string, AttributeValue>, startTime?: TimeInput): Span {
		const span = this.tracer.startSpan(name, { startTime: startTime ?? Date.now() });
		span.setAttributes(this._globalAttributes);
		if (data != null) {
			span.setAttributes(data);
		}
		return span;
	}

	// sendErrorEvent(
	// 	name: string,
	// 	data?: Record<string, string>,
	// ): void {
	// }

	// sendException(
	// 	error: Error | unknown,
	// 	data?: Record<string, string>,
	// ): void {
	// }

	setGlobalAttributes(attributes: Map<string, AttributeValue>): void {
		this._globalAttributes = Object.fromEntries(attributes);
	}
}

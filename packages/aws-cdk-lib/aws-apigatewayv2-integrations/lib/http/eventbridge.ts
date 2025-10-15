import * as apigwv2 from '../../../aws-apigatewayv2';
import * as events from '../../../aws-events';
import * as iam from '../../../aws-iam';

/**
 * Properties to initialize `HttpEventBridgeIntegration`.
 */
export interface HttpEventBridgeIntegrationProps {
  /**
   * Specifies how to transform HTTP requests before sending them to EventBridge.
   *
   * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-aws-services.html#http-api-develop-integrations-aws-services-parameter-mapping
   * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-aws-services-reference.html#EventBridge-PutEvents
   *
   * @default - Specify `Detail`, `DetailType`, and `Source` from the request body.
   * Additionally, set `EventBusName` to the event bus name if provided.
   */
  readonly parameterMapping?: apigwv2.ParameterMapping;

  /**
   * The EventBridge event bus that this integration will send events to.
   *
   * @default - the default event bus
   */
  readonly eventBus?: events.IEventBus;
}

/**
 * The EventBridge integration resource for HTTP API
 */
export class HttpEventBridgeIntegration extends apigwv2.HttpRouteIntegration {
  /**
   * @param id id of the underlying integration construct
   * @param props properties to configure the integration
   */
  constructor(
    id: string,
    private readonly props: HttpEventBridgeIntegrationProps = {},
  ) {
    super(id);
  }

  public bind(
    options: apigwv2.HttpRouteIntegrationBindOptions,
  ): apigwv2.HttpRouteIntegrationConfig {
    const invokeRole = new iam.Role(options.scope, 'InvokeRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    });

    // Determine the event bus ARN - if none specified, grant to all event buses in the account
    const eventBusArn = this.props.eventBus
      ? this.props.eventBus.eventBusArn
      : options.route.stack.formatArn({
        service: 'events',
        resource: 'event-bus',
        resourceName: '*',
      });

    invokeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        sid: 'AllowEventBridgePutEvents',
        actions: ['events:PutEvents'],
        resources: [eventBusArn],
      }),
    );

    return {
      payloadFormatVersion: apigwv2.PayloadFormatVersion.VERSION_1_0,
      type: apigwv2.HttpIntegrationType.AWS_PROXY,
      subtype: apigwv2.HttpIntegrationSubtype.EVENTBRIDGE_PUT_EVENTS,
      credentials: apigwv2.IntegrationCredentials.fromRole(invokeRole),
      connectionType: apigwv2.HttpConnectionType.INTERNET,
      parameterMapping: this.props.parameterMapping ??
        this.createDefaultParameterMapping(),
    };
  }

  private createDefaultParameterMapping(): apigwv2.ParameterMapping {
    const mapping = new apigwv2.ParameterMapping()
      .custom('Detail', '$request.body.Detail')
      .custom('DetailType', '$request.body.DetailType')
      .custom('Source', '$request.body.Source');

    // If an event bus is specified, add it to the parameter mapping
    if (this.props.eventBus) {
      mapping.custom('EventBusName', this.props.eventBus.eventBusName);
    }

    return mapping;
  }
}

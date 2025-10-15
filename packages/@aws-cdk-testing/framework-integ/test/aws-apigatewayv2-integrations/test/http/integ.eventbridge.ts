import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { HttpEventBridgeIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as integ from '@aws-cdk/integ-tests-alpha';

const app = new App();
const stack = new Stack(app, 'eventbridge-integration');

const eventBus = new events.EventBus(stack, 'EventBus');

// Create a log group to capture events for validation
const logGroup = new logs.LogGroup(stack, 'LogGroup', {
  removalPolicy: RemovalPolicy.DESTROY,
});

// Create a rule that matches all events from the integration
const rule = new events.Rule(stack, 'Rule', {
  eventBus,
  eventPattern: {
    source: ['foo'], // Match all sources
  },
});

// Send events to CloudWatch Logs
rule.addTarget(new targets.CloudWatchLogGroup(logGroup));

const httpApi = new apigwv2.HttpApi(stack, 'Api');

// Default integration with event bus
httpApi.addRoutes({
  path: '/events',
  methods: [apigwv2.HttpMethod.POST],
  integration: new HttpEventBridgeIntegration('EventBridgeIntegration', {
    eventBus,
  }),
});

// Integration without specifying event bus (uses default)
httpApi.addRoutes({
  path: '/default-bus',
  methods: [apigwv2.HttpMethod.POST],
  integration: new HttpEventBridgeIntegration('DefaultBusIntegration'),
});

// Integration with custom parameter mapping
httpApi.addRoutes({
  path: '/custom-mapping',
  methods: [apigwv2.HttpMethod.POST],
  integration: new HttpEventBridgeIntegration('CustomMappingIntegration', {
    eventBus,
    parameterMapping: new apigwv2.ParameterMapping()
      .custom('Detail', '$request.body.detail')
      .custom('DetailType', '$request.body.detailType')
      .custom('Source', '$request.body.source')
      .custom('EventBusName', eventBus.eventBusName),
  }),
});

const integTest = new integ.IntegTest(app, 'EventBridgeIntegrationIntegTest', {
  testCases: [stack],
});

// Test sending an event with default mapping
const defaultAssertion = integTest.assertions.httpApiCall(
  `${httpApi.apiEndpoint}/events`,
  {
    body: JSON.stringify({
      Detail: JSON.stringify({ message: 'Hello from API Gateway!' }),
      DetailType: 'myDetailType',
      Source: 'my.application',
    }),
    method: 'POST',
  },
);
defaultAssertion.expect(integ.ExpectedResult.objectLike({ status: 200 }));

// Test sending an event with custom mapping
const customMappingAssertion = integTest.assertions.httpApiCall(
  `${httpApi.apiEndpoint}/custom-mapping`,
  {
    body: JSON.stringify({
      detail: JSON.stringify({ message: 'Hello with custom mapping!' }),
      detailType: 'customDetailType',
      source: 'custom.application',
    }),
    method: 'POST',
  },
);
customMappingAssertion.expect(integ.ExpectedResult.objectLike({ status: 200 }));

// Test sending an event to default bus
const defaultBusAssertion = integTest.assertions.httpApiCall(
  `${httpApi.apiEndpoint}/default-bus`,
  {
    body: JSON.stringify({
      Detail: JSON.stringify({ message: 'Hello to default bus!' }),
      DetailType: 'defaultBusDetailType',
      Source: 'default.bus.application',
    }),
    method: 'POST',
  },
);
defaultBusAssertion.expect(integ.ExpectedResult.objectLike({ status: 200 }));

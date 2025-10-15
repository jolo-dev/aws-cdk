import { Match, Template } from '../../../assertions';
import { HttpApi, HttpRoute, HttpRouteKey, ParameterMapping } from '../../../aws-apigatewayv2';
import * as events from '../../../aws-events';
import { App, Stack } from '../../../core';
import { HttpEventBridgeIntegration } from '../../lib';

describe('EventBridgeIntegration', () => {
  test('default', () => {
    const app = new App();
    const stack = new Stack(app, 'stack');
    const api = new HttpApi(stack, 'HttpApi');
    const eventBus = new events.EventBus(stack, 'EventBus');

    new HttpRoute(stack, 'EventBridgeRoute', {
      httpApi: api,
      integration: new HttpEventBridgeIntegration('Integration', {
        eventBus,
      }),
      routeKey: HttpRouteKey.with('/events'),
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'apigateway.amazonaws.com',
            },
          },
        ]),
      },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'events:PutEvents',
            Effect: 'Allow',
            Resource: stack.resolve(eventBus.eventBusArn),
          },
        ],
      },
      Roles: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      ConnectionType: 'INTERNET',
      CredentialsArn: Match.objectLike({
        'Fn::GetAtt': Match.anyValue(),
      }),
      IntegrationType: 'AWS_PROXY',
      IntegrationSubtype: 'EventBridge-PutEvents',
      PayloadFormatVersion: '1.0',
      RequestParameters: {
        Detail: '$request.body.Detail',
        DetailType: '$request.body.DetailType',
        Source: '$request.body.Source',
        EventBusName: stack.resolve(eventBus.eventBusName),
      },
    });
  });

  test('with custom parameterMapping', () => {
    const app = new App();
    const stack = new Stack(app, 'stack');
    const api = new HttpApi(stack, 'HttpApi');
    const eventBus = new events.EventBus(stack, 'EventBus');

    new HttpRoute(stack, 'EventBridgeRoute', {
      httpApi: api,
      integration: new HttpEventBridgeIntegration('Integration', {
        eventBus,
        parameterMapping: new ParameterMapping()
          .custom('Detail', '$request.body.detail')
          .custom('DetailType', '$request.body.detailType')
          .custom('Source', '$request.body.source')
          .custom('EventBusName', eventBus.eventBusName)
          .custom('Resources', '$request.body.resources')
          .custom('Time', '$request.body.time'),
      }),
      routeKey: HttpRouteKey.with('/events'),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      ConnectionType: 'INTERNET',
      CredentialsArn: Match.objectLike({
        'Fn::GetAtt': Match.anyValue(),
      }),
      IntegrationType: 'AWS_PROXY',
      IntegrationSubtype: 'EventBridge-PutEvents',
      PayloadFormatVersion: '1.0',
      RequestParameters: {
        Detail: '$request.body.detail',
        DetailType: '$request.body.detailType',
        Source: '$request.body.source',
        EventBusName: stack.resolve(eventBus.eventBusName),
        Resources: '$request.body.resources',
        Time: '$request.body.time',
      },
    });
  });

  test('without eventBus uses wildcard permissions', () => {
    const app = new App();
    const stack = new Stack(app, 'stack');
    const api = new HttpApi(stack, 'HttpApi');

    new HttpRoute(stack, 'EventBridgeRoute', {
      httpApi: api,
      integration: new HttpEventBridgeIntegration('Integration'),
      routeKey: HttpRouteKey.with('/events'),
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'events:PutEvents',
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':events:',
                  {
                    Ref: 'AWS::Region',
                  },
                  ':',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  ':event-bus/*',
                ],
              ],
            },
          },
        ],
      },
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      ConnectionType: 'INTERNET',
      CredentialsArn: Match.objectLike({
        'Fn::GetAtt': Match.anyValue(),
      }),
      IntegrationType: 'AWS_PROXY',
      IntegrationSubtype: 'EventBridge-PutEvents',
      PayloadFormatVersion: '1.0',
      RequestParameters: {
        Detail: '$request.body.Detail',
        DetailType: '$request.body.DetailType',
        Source: '$request.body.Source',
      },
    });
  });

  test('can be used with imported event bus', () => {
    const app = new App();
    const stack = new Stack(app, 'stack');
    const api = new HttpApi(stack, 'HttpApi');
    const eventBus = events.EventBus.fromEventBusArn(
      stack,
      'ImportedEventBus',
      'arn:aws:events:us-east-1:123456789012:event-bus/my-event-bus',
    );

    new HttpRoute(stack, 'EventBridgeRoute', {
      httpApi: api,
      integration: new HttpEventBridgeIntegration('Integration', {
        eventBus,
      }),
      routeKey: HttpRouteKey.with('/events'),
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'events:PutEvents',
            Effect: 'Allow',
            Resource: 'arn:aws:events:us-east-1:123456789012:event-bus/my-event-bus',
          },
        ],
      },
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationSubtype: 'EventBridge-PutEvents',
      RequestParameters: {
        Detail: '$request.body.Detail',
        DetailType: '$request.body.DetailType',
        Source: '$request.body.Source',
        EventBusName: 'my-event-bus',
      },
    });
  });

  test('integration can be reused across multiple routes', () => {
    const app = new App();
    const stack = new Stack(app, 'stack');
    const api = new HttpApi(stack, 'HttpApi');
    const eventBus = new events.EventBus(stack, 'EventBus');

    const integration = new HttpEventBridgeIntegration('Integration', {
      eventBus,
    });

    new HttpRoute(stack, 'EventBridgeRoute1', {
      httpApi: api,
      integration,
      routeKey: HttpRouteKey.with('/events1'),
    });

    new HttpRoute(stack, 'EventBridgeRoute2', {
      httpApi: api,
      integration,
      routeKey: HttpRouteKey.with('/events2'),
    });

    const template = Template.fromStack(stack);
    // Should only create one integration
    template.resourceCountIs('AWS::ApiGatewayV2::Integration', 1);
    // Should only create one IAM role
    template.resourceCountIs('AWS::IAM::Role', 1);
  });
});

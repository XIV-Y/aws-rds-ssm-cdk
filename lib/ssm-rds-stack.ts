import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';

import { Construct } from 'constructs';

export class SimpleRdsSsmStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'SimpleRdsSsmVPC', {
      maxAzs: 2,
      cidr: '10.0.0.0/16',
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
      ],
      natGateways: 0,
    });

    const auroraSG = new ec2.SecurityGroup(this, 'AuroraSecurityGroup', {
      vpc,
      allowAllOutbound: false,
    });

    const ssmSG = new ec2.SecurityGroup(this, 'SSMSecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });

    auroraSG.addIngressRule(ssmSG, ec2.Port.tcp(5432), 'Access from SSM');

    const dbSubnetGroup = new rds.SubnetGroup(this, 'AuroraSubnetGroup', {
      vpc,
      description: 'Subnet group for Aurora PostgreSQL cluster',
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    const parameterGroup = new rds.ParameterGroup(this, 'AuroraParameterGroup', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4,
      }),
      description: 'Parameter group for Aurora PostgreSQL cluster',
    });

    const auroraCluster = new rds.DatabaseCluster(this, 'AuroraPostgreSQLCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4,
      }),
      instanceProps: {
        vpc,
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: [auroraSG],
      },
      subnetGroup: dbSubnetGroup,
      parameterGroup: parameterGroup,
      credentials: rds.Credentials.fromGeneratedSecret('postgres', {
        secretName: 'aurora-postgresql-credentials',
        excludeCharacters: '"@/\\\'',
      }),
      defaultDatabaseName: 'webapp',
      deletionProtection: false,
      backup: {
        retention: cdk.Duration.days(1),
      },
      instances: 1,
    });

    // SSM用のEC2インスタンス（ローカルからのDB接続用）
    const ssmInstance = new ec2.Instance(this, 'SSMInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.NANO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: ssmSG,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      userData: ec2.UserData.forLinux({
        shebang: '#!/bin/bash -xe'
      }),
      role: new iam.Role(this, 'SSMInstanceRole', {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        ],
      }),
    });

    // VPCエンドポイント（SSM用）
    const ssmEndpoint = new ec2.InterfaceVpcEndpoint(this, 'SSMEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    const ssmMessagesEndpoint = new ec2.InterfaceVpcEndpoint(this, 'SSMMessagesEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    const ec2MessagesEndpoint = new ec2.InterfaceVpcEndpoint(this, 'EC2MessagesEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    const secretsManagerEndpoint = new ec2.InterfaceVpcEndpoint(this, 'SecretsManagerEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    //--------------------------------------------------------------------------

    new cdk.CfnOutput(this, 'AuroraClusterEndpoint', {
      value: auroraCluster.clusterEndpoint.hostname,
      description: 'Aurora PostgreSQL Cluster Endpoint',
    });

    new cdk.CfnOutput(this, 'AuroraReaderEndpoint', {
      value: auroraCluster.clusterReadEndpoint.hostname,
      description: 'Aurora PostgreSQL Reader Endpoint',
    });

    new cdk.CfnOutput(this, 'SSMInstanceId', {
      value: ssmInstance.instanceId,
      description: 'SSM Instance ID for DB access',
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: auroraCluster.secret?.secretArn || 'No secret created',
      description: 'Aurora PostgreSQL credentials secret ARN',
    });

    new cdk.CfnOutput(this, 'SSMPortForwardCommand', {
      value: `aws ssm start-session --target ${ssmInstance.instanceId} --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{"host":["${auroraCluster.clusterEndpoint.hostname}"],"portNumber":["5432"],"localPortNumber":["5433"]}'`,
      description: 'Command to establish port forwarding to Aurora via SSM',
    });

    new cdk.CfnOutput(this, 'GetDatabaseCredentials', {
      value: `aws secretsmanager get-secret-value --secret-id aurora-postgresql-credentials --query SecretString --output text`,
      description: 'Command to retrieve database credentials',
    });
  }
}

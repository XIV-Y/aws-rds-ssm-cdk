#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SimpleRdsSsmStack } from '../lib/ssm-rds-stack';

const app = new cdk.App();

new SimpleRdsSsmStack(app, 'SimpleRdsSsmStack', {});

# Aurora PostgreSQL with SSM Access
Aurora PostgreSQLをプライベートサブネットに配置し、Session Manager経由でローカルからデータベースにアクセスできる環境を構築します。プライベートサブネットの通信にはVPCエンドポイントを使用しています。

![名称未設定ファイル drawio (3)](https://github.com/user-attachments/assets/b9b65c4d-30b6-4c33-8a41-fe80a3925e75)

## 前提条件

- AWS CLIが設定済みであること
- AWS CDKがインストール済みであること
- Session Manager Pluginがインストール済みであること
- 必要なAWS権限が設定されていること

## 手順

### デプロイ実行
```
cdk deploy
```

### デプロイ後の出力値確認
```
SimpleRdsSsmStack.SSMInstanceId
SimpleRdsSsmStack.AuroraClusterEndpoint
```

### ローカルからSSM経由でアクセス

#### データベース認証情報の取得
認証情報の取得
```
aws secretsmanager get-secret-value --secret-id aurora-postgresql-credentials
```

#### SSMポートフォワーディングの開始
出力値から取得したコマンドを実行
```
aws ssm start-session --target <SSM-Instance-ID> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<Aurora-Endpoint>"],"portNumber":["5432"],"localPortNumber":["5433"]}'
```

成功すると以下のような表示が出ます
```
Starting session with SessionId: user-xxx
Port 5433 opened for sessionId user-xxx
Waiting for connections...
```

#### データベースクライアントでの接続
```
Host: localhost
Port: 5433
Database: 上記で取得したDB名
Username: postgres
Password: 上記で取得したパスワード
```

# 開発要件: Obsidian Copilot SDK 連携プラグイン (Pythonブリッジ方式)

## 概要
Obsidianの右ペイン（サイドバー）にチャットUIを構築し、ユーザーの指示に基づいてローカルのPythonスクリプト（ラッパー）をバックグラウンドで呼び出すカスタムプラグインを開発する。
当初はNode.jsから直接CLIを呼び出す設計だったが、Windows環境での実行安定性の問題から、**Pythonの `copilot-sdk` を中継するアーキテクチャ**へ刷新した。

**参考・依存ライブラリ:**
- copilot sdk: https://github.com/github/copilot-sdk

## 前提条件
- **ターゲット環境:** Obsidian デスクトップ版（Electron / Node.js APIアクセス可能）。
- **外部依存:** - ユーザーのローカル環境に Python 3.x がインストールされていること。
  - Python環境に `copilot` SDKライブラリがインストールされ、認証が完了していること。
- **プラグインの役割:** プラグインは `child_process` を介してローカルのPythonプロセスと通信を行う。直接Copilotと通信するのではなく、Pythonスクリプトを入出力のブリッジとして利用する。

## 主要コンポーネントと設計方針

### 1. `main.ts` (プラグインのエントリーポイント)
- Obsidian APIを使用し、右ペイン用のカスタムビュー（`ItemView`）を登録・初期化する。
- Vaultの絶対パスを取得し、後述のサービス層に渡す。

### 2. `CopilotChatView.ts` (UI層)
- Obsidianの `ItemView` を継承し、右ペインにドッキング可能なチャットUIを構築する。
- Svelte, React, または Vanilla DOM のいずれかを採用。
- **機能:**
  - ユーザーからのプロンプト入力エリア。
  - チャット履歴の表示（Pythonから標準出力を経由して受け取るストリーミング応答の逐次描画）。
  - ローディング（処理中）状態の表示。

### 3. `CopilotService.ts` (制御・実行層)
- Node.jsの `child_process` (`spawn`) を使用して、バックグラウンドでPythonスクリプト (`copilot_wrapper.py`) を呼び出す。
- **コンテキストの注入:** 実行時のカレントディレクトリ (`cwd`) にはVaultの絶対パスを指定する。
- **入出力の処理:**
  - ユーザーのプロンプトをPythonプロセスの標準入力（stdin）に渡し、標準出力（stdout）をリッスンしてUI層にストリーミングで返す。
  - エラーやデバッグログは標準エラー出力（stderr）から受け取る。
- ファイルの自動同期機能はObsidian標準のFile Watcherに委ねる。

### 4. `copilot_wrapper.py` (Pythonブリッジ層 / 新規追加)
- Pythonの `copilot` SDK (`CopilotClient`, `PermissionHandler`) を使用して実際の通信を行う。
- **機能:**
  - `CopilotClient` の初期化とセッションの作成。
  - ファイル操作権限の自動許可（`PermissionHandler.approve_all` を設定）。
  - 標準入力からプロンプトを受け取り、`session.send_and_wait()` でCopilotへ送信。
  - イベントリスナー (`assistant.message_delta`) を用いて、レスポンスの差分（delta）を標準出力へ `flush=True` でストリーミング出力する。

#### 【重要】Python実装サンプル (SDK文法リファレンス)
エディタ（AI）は、`copilot-sdk` の文法および非同期処理の仕様を理解するため、以下の検証済みコードの構造に準拠して `copilot_wrapper.py` の実装を行うこと。

```python
import asyncio
# PermissionHandler をインポートに追加し、権限要求を自動処理する
from copilot import CopilotClient, PermissionHandler

async def main():
    print("🚀 Copilot CLI に接続中...")
    client = CopilotClient()
    await client.start()

    try:
        print("〇 セッションを作成中...")
        # on_permission_request を追加して権限を許可
        session = await client.create_session({
            "model": "gpt-4o",
            "streaming": True,
            "on_permission_request": PermissionHandler.approve_all
        })

        def on_event(event):
            # ストリーミングメッセージの差分を取得
            if event.type.value == "assistant.message_delta":
                delta = event.data.delta_content or ""
                print(delta, end="", flush=True)

        session.on(on_event)

        print("送信中: 'GitHub Copilotの魅力を3行で教えてください'\n")
        print("=== 🤖 Copilot からの応答 ===")

        # send_and_wait メソッドでプロンプトを送信
        await session.send_and_wait({"prompt": "GitHub Copilotの魅力を3行で教えてください"})

        print("\n===========================\n")

    except Exception as e:
        print(f"❌ エラーが発生しました: {e}")
    finally:
        await client.stop()

if __name__ == "__main__":
    asyncio.run(main())
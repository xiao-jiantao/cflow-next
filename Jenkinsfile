// cflow-next 自动部署流水线（Jenkins）
// 链路：GitLab(192.168.0.44) --webhook--> Jenkins(有外网,有 pnpm) --build--> scp --> 部署机 10.1.62.55
// 部署机只运行不构建：用 standalone 自包含包，node 直接跑，pm2 守护，无需 root、无需联网、无需 pnpm。
//
// 【使用前需在 Jenkins 配置的两处】
//  1. SSH 凭据：在 Jenkins → Manage Credentials 添加一条 "SSH Username with private key"
//     - 用户名 cha00180，私钥为能免密登录 10.1.62.55 的私钥
//     - 凭据 ID 填 deploy-ssh（与下方 DEPLOY_SSH_CRED 一致，要改就两处一起改）
//  2. 本 Job 需安装 "SSH Agent" 插件（sshagent 步骤要用）；webhook 触发需 "GitLab" 插件。

pipeline {
  agent any

   // 引用你在“全局工具配置”中设置的 Node.js 安装名称
    tools {
        nodejs 'nodeJS26'   // 这里的名字必须和全局工具配置中的完全一致
    }

  // ── webhook 触发：GitLab push 事件来时自动跑 ──
  // 需配合 GitLab 插件；另需在 GitLab 项目 Settings→Webhooks 填 Jenkins 的 webhook URL。
  triggers {
    gitlab(triggerOnPush: true, branchFilterType: 'NameBasedFilter', includeBranchesSpec: 'master')
  }

  environment {
    DEPLOY_HOST    = '10.1.62.55'
    DEPLOY_USER    = 'cha00180'
    DEPLOY_HOME    = '/home/cha00180'
    DEPLOY_DIR     = '/home/cha00180/apps/cflow-next'   // 部署机上的目标目录
    DEPLOY_SSH_CRED = 'deploy-ssh'                       // 上面配的 SSH 凭据 ID
    APP_NAME       = 'cflow-next'
    APP_PORT       = '3000'
    PM2            = '/home/cha00180/.cflow-tools/node_modules/pm2/bin/pm2'        // 部署机上 pm2 的位置（由本流水线安装）
  }

  options {
    timestamps()
    disableConcurrentBuilds()   // 同一时间只跑一个部署，避免互相覆盖
  }

  stages {
    stage('拉取代码') {
      steps {
        checkout scm   // Jenkins Job 里配好的 GitLab 仓库，自动拉到当前分支
      }
    }

    stage('安装依赖') {
      steps {
        sh 'npm -v'   // Jenkins 有外网、有 pnpm
        sh 'npm install -g pnpm'
        sh 'pnpm install --frozen-lockfile'   // Jenkins 有外网、有 pnpm
      }
    }

    stage('构建 standalone') {
      steps {
        sh 'pnpm build'   // 产出 apps/web/.next/standalone/（含精简 node_modules）
      }
    }

    stage('组装部署包') {
      steps {
        sh '''
          set -e
          DIST=deploy-dist
          rm -rf "$DIST" cflow-next.tar.gz
          # 1) standalone 主体（已含 apps/web/server.js + node_modules）
          cp -r apps/web/.next/standalone "$DIST"
          # 2) 静态资源：standalone 不含 .next/static，需手动放进对应位置
          mkdir -p "$DIST/apps/web/.next/static"
          cp -r apps/web/.next/static/. "$DIST/apps/web/.next/static/"
          # 3) public 目录（若有）
          if [ -d apps/web/public ]; then
            mkdir -p "$DIST/apps/web/public"
            cp -r apps/web/public/. "$DIST/apps/web/public/"
          fi
          # 4) 打成一个 tar 包
          tar -czf cflow-next.tar.gz -C "$DIST" .
          echo "部署包大小：" && du -h cflow-next.tar.gz
        '''
      }
    }

    stage('准备 pm2 离线包') {
      // 部署机不能联网，pm2 由 Jenkins(有外网)装到本地目录后一并传过去。
      // 仅在首次/缺失时真正用得上；每次都备好不影响（幂等）。
      steps {
        sh '''
          set -e
          rm -rf pm2-offline pm2-offline.tar.gz
          npm install --prefix pm2-offline pm2
          tar -czf pm2-offline.tar.gz -C pm2-offline .
        '''
      }
    }

    stage('投递并启动') {
      steps {
        sshagent(credentials: [env.DEPLOY_SSH_CRED]) {
          sh '''
            set -e
            SSH="ssh -o StrictHostKeyChecking=no $DEPLOY_USER@$DEPLOY_HOST"

            # 1) 远程建目录
            $SSH "mkdir -p $DEPLOY_DIR $DEPLOY_HOME/.cflow-tools"

            # 2) 传应用包 + pm2 离线包
            scp -o StrictHostKeyChecking=no cflow-next.tar.gz $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_DIR/
            scp -o StrictHostKeyChecking=no pm2-offline.tar.gz $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_HOME/.cflow-tools/

            # 3) 远程解包应用（先清旧产物再展开）
            $SSH "cd $DEPLOY_DIR && rm -rf apps node_modules package.json && tar -xzf cflow-next.tar.gz && rm -f cflow-next.tar.gz"

            # 4) 远程安装 pm2（没有才装，幂等）
            $SSH "command -v $PM2 >/dev/null 2>&1 || (cd $DEPLOY_HOME/.cflow-tools && tar -xzf pm2-offline.tar.gz && rm -f pm2-offline.tar.gz)"

            # 5) 启动/重启服务
            #    环境变量从部署机上的 ~/.cflow-next.env 读取（含 DEEPSEEK_API_KEY 等，由你维护，不进 git）
            $SSH "cd $DEPLOY_DIR && \\
              set -a && [ -f $DEPLOY_HOME/.cflow-next.env ] && . $DEPLOY_HOME/.cflow-next.env; set +a; \\
              export PORT=$APP_PORT; \\
              ($PM2 restart $APP_NAME --update-env || $PM2 start apps/web/server.js --name $APP_NAME --update-env)"

            echo "部署完成：http://$DEPLOY_HOST:$APP_PORT"
          '''
        }
      }
    }
  }

  post {
    success { echo "✅ 部署成功 -> http://${env.DEPLOY_HOST}:${env.APP_PORT}" }
    failure { echo "❌ 部署失败，看上面日志定位哪个 stage 出错" }
  }
}

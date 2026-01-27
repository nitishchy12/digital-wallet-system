pipeline {
    agent any

    environment {
        DOCKERHUB_USERNAME = "nitishchy12"
        BACKEND_IMAGE = "digital-wallet-backend"
        FRONTEND_IMAGE = "digital-wallet-frontend"
        DOCKER_TAG = "latest"
    }

    stages {

        stage("Checkout Code") {
            steps {
                git branch: 'main',
                    url: 'https://github.com/nitishchy12/digital-wallet-system.git'
            }
        }

        stage("Check Docker") {
            steps {
                sh "docker --version"
                sh "docker compose version || docker-compose --version"
            }
        }

        stage("Docker Build") {
            steps {
                sh """
                docker build -t ${DOCKERHUB_USERNAME}/${BACKEND_IMAGE}:${DOCKER_TAG} backend
                docker build -t ${DOCKERHUB_USERNAME}/${FRONTEND_IMAGE}:${DOCKER_TAG} frontend
                """
            }
        }

        stage("Docker Hub Login") {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-creds',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )
                ]) {
                    sh """
                    echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                    """
                }
            }
        }

        stage("Push Images to Docker Hub") {
            steps {
                sh """
                docker push ${DOCKERHUB_USERNAME}/${BACKEND_IMAGE}:${DOCKER_TAG}
                docker push ${DOCKERHUB_USERNAME}/${FRONTEND_IMAGE}:${DOCKER_TAG}
                """
            }
        }

        stage("Deploy using Docker Compose") {
            steps {
                sh """
                docker compose down || docker-compose down
                docker compose pull || docker-compose pull
                docker compose up -d || docker-compose up -d
                """
            }
        }

        stage("Health Check") {
            steps {
                sh """
                sleep 20
                curl --retry 5 --retry-delay 5 --fail http://localhost:5000/api/health
                """
            }
        }
    }

    post {
        success {
            echo "Deployment successful!"
        }
        failure {
            echo "Deployment failed!"
        }
    }
}

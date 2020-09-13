# Architecting with Google Kubernetes Engine - Workloads
# AK8S-06 Creating Kubernetes Engine Deployments
# Task 0. Lab Setup

### You can list the active account name with this command:
```
gcloud auth list
```

### You can list the project ID with this command:
```
gcloud config list project
```

# Task 1. Create deployment manifests and deploy to the cluster

### set the environment variable for the zone and cluster name:
```
export my_zone=us-central1-a
export my_cluster=standard-cluster-1
```

### Configure kubectl tab completion in Cloud Shell:
```
source <(kubectl completion bash)
```
### create a Kubernetes cluster:
```
gcloud container clusters create $my_cluster --num-nodes 3  --enable-ip-alias --zone $my_zone
```

### configure access to your cluster for the kubectl command-line tool:
```
gcloud container clusters get-credentials $my_cluster --zone $my_zone
```

### clone the repository to the lab Cloud Shell:
```
git clone https://github.com/GoogleCloudPlatformTraining/training-data-analyst
```

### Change to the directory that contains the sample files for this lab:
```
cd ~/training-data-analyst/courses/ak8s/06_Deployments/
```

### Create a deployment manifest:
```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.7.9
        ports:
        - containerPort: 80
```

### To deploy your manifest, execute the following command:
```
kubectl apply -f ./nginx-deployment.yaml
```

### To view a list of deployments, execute the following command:
```
kubectl get deployments
```
# Task 2. Scale Pods up and down in the shell

### to view a list of Pods in the deployments, execute the following command::
```
kubectl get deployments
```

### To scale the Pod back up to three replicas, execute the following command:
```
kubectl scale --replicas=3 deployment nginx-deployment
```

### To view a list of Pods in the deployments, execute the following command:
```
kubectl get deployments
```

# Task 3. Trigger a deployment rollout and a deployment rollback

# Trigger a deployment rollout

### To update the version of nginx in the deployment, execute the following command:
```
kubectl set image deployment.v1.apps/nginx-deployment nginx=nginx:1.9.1 --record
```

### To view the rollout status, execute the following command:
```
kubectl rollout status deployment.v1.apps/nginx-deployment
```

### To verify the change, get the list of deployments.
```
kubectl get deployments
```

### View the rollout history of the deployment:
```
kubectl rollout history deployment nginx-deployment
```

# Trigger a deployment rollback

### To roll back to the previous version of the nginx deployment, execute the following command:
```
kubectl rollout undo deployments nginx-deployment
```

### View the updated rollout history of the deployment:
```
kubectl rollout history deployment nginx-deployment
```

### View the details of the latest deployment revision:
```
kubectl rollout history deployment/nginx-deployment --revision=3
```
# Task 4. Define the service type in the manifest

### Define service types in the manifest:
```
apiVersion: v1
kind: Service
metadata:
  name: nginx
spec:
  type: LoadBalancer
  selector:
    app: nginx
  ports:
  - protocol: TCP
    port: 60000
    targetPort: 80
```

### to deploy your manifest, execute the following command:
```
kubectl apply -f ./service-nginx.yaml
```

# Verify the LoadBalancer creation

### To view the details of the nginx service, execute the following command:
```
kubectl get service nginx
```

# Task 5. Perform a canary deployment

### The manifest file nginx-canary.yaml:
```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-canary
  labels:
    app: nginx
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
        track: canary
        Version: 1.9.1
    spec:
      containers:
      - name: nginx
        image: nginx:1.9.1
        ports:
        - containerPort: 80
```

### Create the canary deployment based on the configuration file:
```
kubectl apply -f nginx-canary.yaml
```

### verify that both the nginx and the nginx-canary deployments are present:
```
kubectl get deployments
```

### scale down the primary deployment to 0 replicas:
```
kubectl scale --replicas=0 deployment nginx-deployment
```

### Verify that the only running replica is now the Canary deployment:
```
kubectl get deployments
```


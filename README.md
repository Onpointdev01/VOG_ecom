# VOG_ecom

E-commerce

# Backend Project

This is a Node.js backend project using TypeScript, Express, and Inversify for dependency injection.

## How to Start Development

Follow these steps to set up the project locally:

1. Clone the repository:
   ```bash
   git clone <repository-url>
   ```
2. Install the project dependencies using either npm or yarn:
   ```bash
   npm install
   ```
   Or:
   ```bash
   yarn install
   ```
3. Copy the `.env.example` file to `.env`
   ```bash
   cp .env.example .env
   ```
4. Make the necessary changes to the `.env` file according to your local environment setup.
5. Start the development server:

   ```bash
   npm run dev
   ```

   ## Using Inversify in the project

   This section outlines how to effectively use InversifyJS in a TypeScript project, covering the creation of types, services, controllers, and models, along with dependency injection and binding.

   ### creating types

   InversifyJS uses symbols as identifiers for dependency injection. add your types to the `di\index.ts` file since the model and service are injected into the controller, you can create symbols for them

   ### creating a service

   Services contain the business logic. Use the `@injectable()` decorator to make them injectable.

   ```js
    // services/UserService.ts
    import { injectable } from 'inversify';

    @injectable()
    export class UserService {
        public getUsers(): string[] {
            return ['User1', 'User2'];
        }
    }
   ```

   ### creating a controller

   Controllers handle incoming HTTP requests and delegate to services. They also need to be injectable. a sample is shown below look at `controllers/AuthController.ts` for more detailed sample

   ```js
   // controllers/UserController.ts
   import { inject, injectable } from 'inversify';
   import { TYPES } from '../types';
   import { UserService } from '../services/UserService';

   @controller('api/v1/users')
   export class UserController {
       private userService: UserService;

       constructor(@inject(TYPES.UserService) userService: UserService) {
           this.userService = userService;
       }

       @httpPost('/get-all-users')
       public listUsers(): string[] {
           return this.userService.getUsers();
       }
   }
   ```

   ### binding controllers and services

   Use the Inversify container to bind types to their implementations. a container has already been created in `app.ts` file. sample below:

   ```js
   container.bind < UserService > TYPES.UserService.to(UserService);
   containser.bind < UserController > TYPES.UserController.to(UserController);
   ```

   ## handling Responses and Errors

   Our application is designed to ensure a consistent structure for sending responses and handling errors across all controllers. This guide will help you understand how to utilize these mechanisms effectively.

   ### sending Responses

   We have a `BaseController` that includes a method `sendResponse` for sending responses. This method ensures that all our responses have a consistent format. When you create a new controller, you should extend `BaseController` to inherit this functionality.

   ### throwing Errors

   For error handling, our application uses a global error handler. To invoke this error handler, you can throw an AppError from anywhere in your application. The AppError class allows us to specify the HTTP status code, an error message, and optionally, any additional details.

   the error handler should be imported from `./utils/errors/AppError`

   The global error handler will catch this error and send an appropriate response to the client, maintaining the consistency of error responses throughout the application.

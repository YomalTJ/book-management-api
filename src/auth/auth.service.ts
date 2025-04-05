import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async login(username: string, password: string) {
    try {
      const keycloakUrl = this.configService.get('keycloak.url');
      const realm = this.configService.get('keycloak.realm');
      const clientId = this.configService.get('keycloak.clientId');
      const clientSecret = this.configService.get('keycloak.clientSecret');

      const response = await axios.post(
        `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'password',
          username,
          password,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        'Login failed',
        error.response ? error.response.data : error.message,
      );

      if (error.response) {
        const errorDescription = error.response.data.error_description;
        if (
          errorDescription &&
          errorDescription.includes('Account is not fully set up')
        ) {
          this.logger.error(
            'Account is not fully set up. Please verify email or complete any required actions.',
          );

          throw new HttpException(
            {
              statusCode: HttpStatus.FORBIDDEN,
              message:
                'Account is not fully set up. Please verify your email or complete any required actions.',
              error: 'Account Setup Incomplete',
            },
            HttpStatus.FORBIDDEN,
          );
        } else {
          this.logger.error(
            `Keycloak error response: ${JSON.stringify(error.response.data)}`,
          );
          throw new HttpException(
            'Invalid credentials',
            HttpStatus.UNAUTHORIZED,
          );
        }
      }

      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }
  }

  async registerUser(userData: {
    username: string;
    email: string;
    password: string;
  }) {
    try {
      const keycloakUrl = this.configService.get('keycloak.url');
      const realm = this.configService.get('keycloak.realm');
      const clientId = this.configService.get('keycloak.clientId');
      const clientSecret = this.configService.get('keycloak.clientSecret');

      // Get admin token
      const tokenResponse = await axios.post(
        `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
        new URLSearchParams({
          client_id: 'admin-cli',
          username: this.configService.get('keycloak.adminUsername') || '',
          password: this.configService.get('keycloak.adminPassword') || '',
          grant_type: 'password',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
      this.logger.log('Admin token response: ', tokenResponse.data); // Log token response

      const adminToken = tokenResponse.data.access_token;

      // Create user in Keycloak
      const createUserResponse = await axios.post(
        `${keycloakUrl}/admin/realms/${realm}/users`,
        {
          username: userData.username,
          email: userData.email,
          enabled: true,
          credentials: [
            {
              type: 'password',
              value: userData.password,
              temporary: false,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      this.logger.log('Create user response: ', createUserResponse.data); // Log the user creation response

      // Get the user ID from the Location header
      const locationHeader = createUserResponse.headers.location;
      const keycloakId = locationHeader.substring(
        locationHeader.lastIndexOf('/') + 1,
      );

      // Additional update to set email as verified
      await axios.put(
        `${keycloakUrl}/admin/realms/${realm}/users/${keycloakId}`,
        {
          emailVerified: true,
          requiredActions: [],
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // Store user in the local database
      const user = await this.prismaService.user.create({
        data: {
          keycloakId,
          email: userData.email,
          username: userData.username,
        },
      });

      return { message: 'User registered successfully' };
    } catch (error) {
      this.logger.error('Registration failed with error: ', error);

      // Log more specific error details if available
      if (error.response) {
        this.logger.error(
          'Error response from Keycloak: ',
          error.response.data,
        );
        this.logger.error(
          'Error status from Keycloak: ',
          error.response.status,
        );
      }

      throw new HttpException(
        'Registration failed, please check server logs.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

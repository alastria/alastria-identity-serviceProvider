import { Identity } from './../../../models/identity/identity.model';
import { Component, OnInit } from '@angular/core';

// SERVICES
import { UserService } from 'src/app/services/user/user.service';
import { SocketService } from 'src/app/services/socket/socket.service';
import { ServiceProviderService } from 'src/app/services/serviceProvider/service-provider.service';

// MODELS
import { User } from 'src/app/models/user/user.model';
import { Event } from 'src/app/models/enums/enums.model';

declare var $: any;

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styles: [
    `
    :host ::ng-deep app-disabled-form > form,  #create-alastria-id{
      padding-left: 40px;
    }
    :host ::ng-deep app-generate-qr qrcode > img{
      margin: auto;
    }
    `
  ],
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  user: User;
  qrAlastriaId: string;
  qrCredentials: any;
  optionsMenu = ['Edit profile', 'Reset password'];
  ioConnection: any; // websocket connection
  htmlSuccessCreateAlastriaId = `
    <img src="../../../../assets/images/success-icon.svg" alt="Success icon">
    <h1> Success! </h1>
    <p> Congratulations, your Alastria ID has been created and vinculated with your accouunt </p>
  `;

  constructor(private userService: UserService,
              private socketService: SocketService,
              private serviceProvider: ServiceProviderService) { }

  ngOnInit() {
    this.user = this.userService.getUserLoggedIn();
    this.initIoConnection();
  }

  handleGenerateQr(event: string): void {
    this.qrAlastriaId = event;
    this.socketService.send('Test'); // mock
  }

  private initIoConnection(): void {
    this.socketService.initSocket();

    this.ioConnection = this.socketService.onMessage()
      .subscribe((message: any) => {
        const identity: Identity = {
          signedTX: message,
        };

        this.serviceProvider.createIdentity(identity)
          .then((result: any) => {
            if (result && result.status === 200) {
              $('#myModal').modal('show');
              console.log(result);
            }
          })
        .catch((error: any) => {
          console.error(error);
        });
      });

    this.socketService.onEvent(Event.CONNECT)
      .subscribe(() => {
        console.log('connected - websocket');
      });

    this.socketService.onEvent(Event.DISCONNECT)
      .subscribe(() => {
        console.log('disconnected - websocket');
      });
  }
}
